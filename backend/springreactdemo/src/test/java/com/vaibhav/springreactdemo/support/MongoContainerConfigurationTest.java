package com.vaibhav.springreactdemo.support;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.util.Arrays;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.mongodb.autoconfigure.MongoConnectionDetails;
import org.springframework.boot.mongodb.autoconfigure.metrics.MongoMetricsAutoConfiguration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.boot.mongodb.autoconfigure.MongoClientSettingsBuilderCustomizer;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.core.instrument.binder.mongodb.MongoMetricsCommandListener;
import io.micrometer.core.instrument.binder.mongodb.MongoMetricsConnectionPoolListener;

/** Pure metadata/settings/probe tests: no container start, sockets or real credentials. */
class MongoContainerConfigurationTest {

    @Test
    void missingContainerWiringFailsBeforeMongoClientCreation() {
        AtomicBoolean clientCreated = new AtomicBoolean();
        try (var context = new GenericApplicationContext()) {
            new MongoTestIsolationInitializer().initialize(context);
            context.registerBean("mongoClient", MongoClient.class, () -> {
                clientCreated.set(true);
                throw new AssertionError("An unguarded Mongo client must never be created");
            });
            var failure = assertThrows(IllegalStateException.class, context::refresh);
            assertEquals(MongoTestIsolationInitializer.MISSING_WIRING, failure.getMessage());
            assertFalse(clientCreated.get());
        }
    }

    @Test
    void unrelatedBeanWithTheOwnedNameCannotBypassTheGuard() {
        try (var context = new GenericApplicationContext()) {
            new MongoTestIsolationInitializer().initialize(context);
            context.registerBean(MongoContainerTestConfiguration.CONTAINER_BEAN_NAME,
                    String.class, () -> "not-a-container");
            var failure = assertThrows(IllegalStateException.class, context::refresh);
            assertEquals(MongoTestIsolationInitializer.MISSING_WIRING, failure.getMessage());
        }
    }

    @Test
    void checkingAnOwnedLazyDefinitionDoesNotStartDocker() {
        try (var context = new GenericApplicationContext()) {
            new MongoTestIsolationInitializer().initialize(context);
            context.registerBean(MongoContainerTestConfiguration.CONTAINER_BEAN_NAME,
                    MongoContainerTestConfiguration.OwnedMongoDBContainer.class,
                    () -> { throw new AssertionError("Metadata guard must not instantiate the container"); },
                    definition -> definition.setLazyInit(true));
            assertDoesNotThrow(context::refresh);
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void explicitClientOrSettingsDefinitionsAreRejectedBeforeInstantiation(boolean settings) {
        AtomicBoolean created = new AtomicBoolean();
        try (var context = new GenericApplicationContext()) {
            new MongoTestIsolationInitializer().initialize(context);
            context.registerBean(MongoContainerTestConfiguration.CONTAINER_BEAN_NAME,
                    MongoContainerTestConfiguration.OwnedMongoDBContainer.class,
                    () -> { throw new AssertionError("Guard must not start a container"); },
                    definition -> definition.setLazyInit(true));
            if (settings) {
                context.registerBean("unsupportedSettings", MongoClientSettings.class, () -> {
                    created.set(true);
                    throw new AssertionError("Guard must reject custom settings before creation");
                });
            } else {
                context.registerBean("unsupportedClient", MongoClient.class, () -> {
                    created.set(true);
                    throw new AssertionError("Guard must reject a custom client before creation");
                });
            }
            var failure = assertThrows(IllegalStateException.class, context::refresh);
            assertEquals(MongoTestIsolationInitializer.CUSTOM_CLIENT_REJECTED, failure.getMessage());
            assertFalse(created.get());
        }
    }

    @Test
    void trailingCustomizerCannotBypassTheConnectionGuard() {
        MongoClientSettingsBuilderCustomizer guard = builder -> { };
        MongoClientSettingsBuilderCustomizer other = builder -> { };
        assertDoesNotThrow(() -> MongoContainerTestConfiguration.requireLastCustomizer(guard,
                java.util.List.of(other, guard)));
        var failure = assertThrows(IllegalStateException.class,
                () -> MongoContainerTestConfiguration.requireLastCustomizer(guard, java.util.List.of(guard, other)));
        assertEquals(MongoContainerTestConfiguration.CUSTOMIZER_ORDER_REJECTED, failure.getMessage());
        assertThrows(IllegalStateException.class,
                () -> MongoContainerTestConfiguration.requireLastCustomizer(guard, java.util.List.of()));
    }

    @Test
    void springWiringIncludesTheGuardAndAcceptsOnlyTheOwnedConnection() {
        try (var context = new AnnotationConfigApplicationContext(SpringGuardWiring.class)) {
            var fixture = context.getBean(SpringGuardWiring.class);
            var guard = context.getBean("ownedMongoConnectionGuard", MongoClientSettingsBuilderCustomizer.class);
            var customizers = context.getBeanProvider(MongoClientSettingsBuilderCustomizer.class)
                    .orderedStream().toList();
            assertEquals(2, customizers.size());
            assertSame(guard, customizers.getLast());
            // Reproduce the original injection trap, then exercise the actual corrected factory.
            assertFalse(fixture.injectedProvider.orderedStream().anyMatch(candidate -> candidate == guard));
            var builder = MongoClientSettings.builder();
            assertDoesNotThrow(() -> customizers.forEach(customizer -> customizer.customize(builder)));
            assertEquals(new ConnectionString(SpringGuardWiring.OWNED_URI).getHosts(),
                    builder.build().getClusterSettings().getHosts().stream()
                            .map(address -> address.getHost() + ":" + address.getPort()).toList());
            verify(fixture.container, never()).start();
        }
    }

    @Test
    void springWiringStillRejectsATrailingCustomizer() {
        try (var context = new AnnotationConfigApplicationContext(
                SpringGuardWiring.class, TrailingCustomizerWiring.class)) {
            var fixture = context.getBean(SpringGuardWiring.class);
            var guard = context.getBean("ownedMongoConnectionGuard", MongoClientSettingsBuilderCustomizer.class);
            var trailing = context.getBean("trailingCustomizer", MongoClientSettingsBuilderCustomizer.class);
            var customizers = context.getBeanProvider(MongoClientSettingsBuilderCustomizer.class)
                    .orderedStream().toList();
            assertEquals(3, customizers.size());
            assertSame(trailing, customizers.getLast());
            var failure = assertThrows(IllegalStateException.class,
                    () -> guard.customize(MongoClientSettings.builder()
                            .applyConnectionString(new ConnectionString(SpringGuardWiring.OWNED_URI))));
            assertEquals(MongoContainerTestConfiguration.CUSTOMIZER_ORDER_REJECTED, failure.getMessage());
            verify(fixture.container, never()).start();
        }
    }

    @Test
    void springWiringStillRejectsNonOwnedFinalClientSettings() {
        try (var context = new AnnotationConfigApplicationContext(SpringGuardWiring.class)) {
            var fixture = context.getBean(SpringGuardWiring.class);
            var guard = context.getBean("ownedMongoConnectionGuard", MongoClientSettingsBuilderCustomizer.class);
            var failure = assertThrows(IllegalStateException.class,
                    () -> guard.customize(MongoClientSettings.builder()
                            .applyConnectionString(new ConnectionString("mongodb://127.0.0.1:43128/qa_i2"))));
            assertEquals(MongoContainerTestConfiguration.CONNECTION_REJECTED, failure.getMessage());
            verify(fixture.container, never()).start();
        }
    }

    @Test
    void actuatorMetricsChainRetainsNativeCustomizersAndRunsGuardLast() {
        try (var context = new AnnotationConfigApplicationContext(ActuatorGuardWiring.class)) {
            var fixture = context.getBean(SpringGuardWiring.class);
            var guard = context.getBean(MongoContainerTestConfiguration.GUARD_BEAN_NAME,
                    MongoClientSettingsBuilderCustomizer.class);
            var customizers = context.getBeanProvider(MongoClientSettingsBuilderCustomizer.class)
                    .orderedStream().toList();
            assertEquals(4, customizers.size());
            assertSame(guard, customizers.getLast());
            assertTrue(customizers.contains(context.getBean("mongoMetricsCommandListenerClientSettingsBuilderCustomizer")));
            assertTrue(customizers.contains(context.getBean("mongoMetricsConnectionPoolListenerClientSettingsBuilderCustomizer")));
            var builder = MongoClientSettings.builder();
            assertDoesNotThrow(() -> customizers.forEach(customizer -> customizer.customize(builder)));
            var settings = builder.build();
            assertTrue(settings.getCommandListeners().contains(context.getBean(MongoMetricsCommandListener.class)));
            assertTrue(settings.getConnectionPoolSettings().getConnectionPoolListeners()
                    .contains(context.getBean(MongoMetricsConnectionPoolListener.class)));
            assertEquals(new ConnectionString(SpringGuardWiring.OWNED_URI).getHosts(),
                    settings.getClusterSettings().getHosts().stream()
                            .map(address -> address.getHost() + ":" + address.getPort()).toList());
            verify(fixture.container, never()).start();
        }
    }

    @Test
    void actuatorMetricsChainStillRejectsACustomizerAddedAfterGuardRegistration() {
        try (var context = new AnnotationConfigApplicationContext(ActuatorGuardWiring.class)) {
            // Simulate a later extension: the registration fix must not disable the final-order check.
            MongoClientSettingsBuilderCustomizer trailing = builder -> { };
            context.registerBean("qaLateCustomizer", MongoClientSettingsBuilderCustomizer.class, () -> trailing);
            var customizers = context.getBeanProvider(MongoClientSettingsBuilderCustomizer.class)
                    .orderedStream().toList();
            assertEquals(5, customizers.size());
            assertSame(trailing, customizers.getLast());
            var guard = context.getBean(MongoContainerTestConfiguration.GUARD_BEAN_NAME,
                    MongoClientSettingsBuilderCustomizer.class);
            var failure = assertThrows(IllegalStateException.class,
                    () -> guard.customize(MongoClientSettings.builder()
                            .applyConnectionString(new ConnectionString(SpringGuardWiring.OWNED_URI))));
            assertEquals(MongoContainerTestConfiguration.CUSTOMIZER_ORDER_REJECTED, failure.getMessage());
            verify(context.getBean(SpringGuardWiring.class).container, never()).start();
        }
    }

    @Test
    void lateRegistrationMovesOnlyTheOwnedDefinitionWithoutCreatingBeans() {
        AtomicBoolean instantiated = new AtomicBoolean();
        try (var context = new GenericApplicationContext()) {
            for (String name : java.util.List.of("qaFirst", MongoContainerTestConfiguration.GUARD_BEAN_NAME,
                    "qaMetricsOne", "qaMetricsTwo")) {
                context.registerBean(name, MongoClientSettingsBuilderCustomizer.class, () -> {
                    instantiated.set(true);
                    throw new AssertionError("Registration must inspect definitions only");
                });
            }
            var registry = context.getDefaultListableBeanFactory();
            var definition = registry.getBeanDefinition(MongoContainerTestConfiguration.GUARD_BEAN_NAME);
            var nativeOrder = Arrays.stream(registry.getBeanDefinitionNames())
                    .filter(name -> !name.equals(MongoContainerTestConfiguration.GUARD_BEAN_NAME)).toList();
            MongoContainerTestConfiguration.ownedMongoGuardRegistration().postProcessBeanFactory(registry);
            var names = Arrays.asList(registry.getBeanDefinitionNames());
            assertEquals(MongoContainerTestConfiguration.GUARD_BEAN_NAME, names.getLast());
            assertSame(definition, registry.getBeanDefinition(MongoContainerTestConfiguration.GUARD_BEAN_NAME));
            assertEquals(nativeOrder, names.stream()
                    .filter(name -> !name.equals(MongoContainerTestConfiguration.GUARD_BEAN_NAME)).toList());
            assertFalse(instantiated.get());
        }
    }

    @Test
    void lateRegistrationRejectsMissingOrAlreadyInstantiatedGuard() {
        try (var context = new GenericApplicationContext()) {
            var registration = MongoContainerTestConfiguration.ownedMongoGuardRegistration();
            var missing = assertThrows(IllegalStateException.class,
                    () -> registration.postProcessBeanFactory(context.getBeanFactory()));
            assertEquals(MongoContainerTestConfiguration.GUARD_REGISTRATION_REJECTED, missing.getMessage());
            context.registerBean(MongoContainerTestConfiguration.GUARD_BEAN_NAME,
                    MongoClientSettingsBuilderCustomizer.class, () -> builder -> { });
            context.getBeanFactory().registerSingleton(MongoContainerTestConfiguration.GUARD_BEAN_NAME,
                    (MongoClientSettingsBuilderCustomizer) builder -> { });
            var created = assertThrows(IllegalStateException.class,
                    () -> registration.postProcessBeanFactory(context.getBeanFactory()));
            assertEquals(MongoContainerTestConfiguration.GUARD_REGISTRATION_REJECTED, created.getMessage());
        }
    }

    @Test
    void externalDatabaseEnvironmentCannotReplaceTheFailClosedTestProperties() {
        try (var context = new GenericApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new SystemEnvironmentPropertySource(
                    "qa-synthetic-database-environment", Map.of(
                            "MONGODB_URI", "mongodb://127.0.0.1:1/qa-unselected-dev",
                            "MONGODB_TEST_URI", "mongodb://127.0.0.1:1/qa-unselected-test",
                            "SPRING_MONGODB_URI", "mongodb://127.0.0.1:1/qa-unselected-direct",
                            "SPRING_MONGODB_DATABASE", "qa-unselected-database")));
            var initializer = new MongoTestIsolationInitializer();
            initializer.initialize(context);
            initializer.initialize(context);
            assertEquals(MongoTestIsolationInitializer.REQUIRED_URI,
                    context.getEnvironment().getProperty("spring.mongodb.uri"));
            assertEquals(MongoTestIsolationInitializer.DATABASE_NAME,
                    context.getEnvironment().getProperty("spring.mongodb.database"));
        }
    }

    @Test
    void unavailableDockerHasAnActionableFailureWithoutSkipping() {
        var failure = assertThrows(IllegalStateException.class,
                () -> MongoContainerTestConfiguration.requireDockerAvailable(() -> false));
        assertEquals(MongoContainerTestConfiguration.DOCKER_REQUIRED, failure.getMessage());
        assertNull(failure.getCause());
    }

    @Test
    void dockerProbeFailuresNeverExposeUnderlyingConfiguration() {
        var failure = assertThrows(IllegalStateException.class,
                () -> MongoContainerTestConfiguration.requireDockerAvailable(() -> {
                    throw new IllegalArgumentException("qa-private-provider-diagnostic");
                }));
        assertEquals(MongoContainerTestConfiguration.DOCKER_REQUIRED, failure.getMessage());
        assertNull(failure.getCause());
        assertDoesNotThrow(() -> MongoContainerTestConfiguration.requireDockerAvailable(() -> true));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"unix:///var/run/docker.sock", "tcp://127.0.0.1:2375", "http://localhost:2375"})
    void localDockerEndpointFormsAreAcceptedWithoutConnecting(String endpoint) {
        assertDoesNotThrow(() -> MongoContainerTestConfiguration.requireLocalDockerEndpoint(endpoint));
    }

    @ParameterizedTest
    @ValueSource(strings = {"tcp://remote.invalid:2375", "unix://remote.invalid/docker.sock", "not a URI",
            "relative-endpoint", "tcp://qa-private@localhost:2375"})
    void remoteOrMalformedDockerEndpointsFailWithoutConnecting(String endpoint) {
        var failure = assertThrows(IllegalStateException.class,
                () -> MongoContainerTestConfiguration.requireLocalDockerEndpoint(endpoint));
        assertEquals("Backend integration tests require a local Docker endpoint.", failure.getMessage());
        assertNull(failure.getCause());
    }

    @Test
    void connectionGuardChecksBothServiceDetailsAndFinalClientSettings() {
        var owned = new ConnectionString("mongodb://127.0.0.1:43127/qa_i2");
        var other = new ConnectionString("mongodb://127.0.0.1:43128/qa_i2");
        var ownedSettings = MongoClientSettings.builder().applyConnectionString(owned).build();
        var otherSettings = MongoClientSettings.builder().applyConnectionString(other).build();
        assertDoesNotThrow(() -> MongoContainerTestConfiguration.requireOwnedConnection(
                owned, ownedSettings, "127.0.0.1", 43127));
        assertThrows(IllegalStateException.class, () -> MongoContainerTestConfiguration.requireOwnedConnection(
                other, ownedSettings, "127.0.0.1", 43127));
        assertThrows(IllegalStateException.class, () -> MongoContainerTestConfiguration.requireOwnedConnection(
                owned, otherSettings, "127.0.0.1", 43127));
        assertThrows(IllegalStateException.class, () -> MongoContainerTestConfiguration.requireOwnedConnection(
                owned, ownedSettings, "127.0.0.1", 27017));
        assertThrows(IllegalStateException.class, () -> MongoContainerTestConfiguration.requireOwnedConnection(
                owned, ownedSettings, "remote.invalid", 43127));
    }

    @Test
    void bootInitializerRegistrationIsPresentOnTheTestClasspath() throws Exception {
        var resources = getClass().getClassLoader().getResources("META-INF/spring.factories");
        boolean registered = false;
        while (resources.hasMoreElements()) {
            var properties = new Properties();
            try (var stream = resources.nextElement().openStream()) {
                properties.load(stream);
            }
            String initializers = properties.getProperty("org.springframework.context.ApplicationContextInitializer", "");
            registered |= java.util.Arrays.stream(initializers.split(","))
                    .anyMatch(name -> name.trim().equals(MongoTestIsolationInitializer.class.getName()));
        }
        assertTrue(registered, "Boot must automatically load the test-only isolation initializer");
    }

    /** Real Spring bean resolution, but only mocked container metadata and settings builders. */
    @TestConfiguration(proxyBeanMethods = false)
    static class SpringGuardWiring {

        static final String OWNED_URI = "mongodb://127.0.0.1:43127/qa_i2";
        private final MongoContainerTestConfiguration.OwnedMongoDBContainer container =
                mock(MongoContainerTestConfiguration.OwnedMongoDBContainer.class);
        private final MongoConnectionDetails connection = mock(MongoConnectionDetails.class);
        private ObjectProvider<MongoClientSettingsBuilderCustomizer> injectedProvider;

        SpringGuardWiring() {
            when(container.getHost()).thenReturn("127.0.0.1");
            when(container.getMappedPort(27017)).thenReturn(43127);
            when(connection.getConnectionString()).thenReturn(new ConnectionString(OWNED_URI));
        }

        @Bean
        @Order(0)
        MongoClientSettingsBuilderCustomizer standardSettings() {
            return builder -> builder.applyConnectionString(new ConnectionString(OWNED_URI));
        }

        @Bean
        @Order(Ordered.LOWEST_PRECEDENCE)
        MongoClientSettingsBuilderCustomizer ownedMongoConnectionGuard(
                ConfigurableListableBeanFactory beanFactory,
                ObjectProvider<MongoClientSettingsBuilderCustomizer> customizers) {
            injectedProvider = customizers;
            return new MongoContainerTestConfiguration().ownedMongoConnectionGuard(container, connection, beanFactory);
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TrailingCustomizerWiring {

        @Bean
        @Order(Ordered.LOWEST_PRECEDENCE)
        MongoClientSettingsBuilderCustomizer trailingCustomizer() {
            return builder -> { };
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Import(SpringGuardWiring.class)
    @ImportAutoConfiguration(MongoMetricsAutoConfiguration.class)
    static class ActuatorGuardWiring {

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }

        @Bean
        static BeanFactoryPostProcessor ownedMongoGuardRegistration() {
            return MongoContainerTestConfiguration.ownedMongoGuardRegistration();
        }
    }
}
