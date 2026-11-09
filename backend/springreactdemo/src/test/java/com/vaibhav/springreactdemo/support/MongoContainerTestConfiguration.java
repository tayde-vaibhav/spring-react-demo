package com.vaibhav.springreactdemo.support;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.function.BooleanSupplier;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.Ports;
import com.github.dockerjava.api.model.PortBinding;
import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.ServerAddress;

import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.mongodb.autoconfigure.MongoClientSettingsBuilderCustomizer;
import org.springframework.boot.mongodb.autoconfigure.MongoConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.mongodb.MongoDBContainer;
import org.testcontainers.utility.TestcontainersConfiguration;

@TestConfiguration(proxyBeanMethods = false)
public class MongoContainerTestConfiguration {

    public static final String CONTAINER_BEAN_NAME = "i2OwnedMongoContainer";
    static final String GUARD_BEAN_NAME = "ownedMongoConnectionGuard";
    public static final String IMAGE = "mongo:7.0.45";
    static final int MONGO_PORT = 27017;
    static final String DOCKER_REQUIRED = "Docker is required for backend integration tests. "
            + "Start an accessible local Docker daemon and rerun ./mvnw clean verify; "
            + "tests never fall back to an external Mongo database.";
    static final String START_FAILED = "Owned Mongo test container could not start. "
            + "Check local Docker access and approved Mongo/cleanup image availability; "
            + "no external database fallback is permitted.";
    static final String CONNECTION_REJECTED = "Mongo test connection must target only its owned local container.";
    static final String CUSTOMIZER_ORDER_REJECTED = "Owned Mongo connection guard must be the last settings customizer.";
    static final String GUARD_REGISTRATION_REJECTED = "Owned Mongo guard requires an uninstantiated bean definition.";

    @Bean(name = CONTAINER_BEAN_NAME)
    @ServiceConnection
    public OwnedMongoDBContainer mongoContainer() {
        return new OwnedMongoDBContainer();
    }

    @Bean
    static BeanFactoryPostProcessor ownedMongoGuardRegistration() {
        // Ordinary/auto-config definitions exist before this phase; no beans are created here.
        // Move only our definition to break LOWEST_PRECEDENCE ties with native metrics beans.
        return factory -> {
            if (!(factory instanceof BeanDefinitionRegistry registry)
                    || !registry.containsBeanDefinition(GUARD_BEAN_NAME)
                    || factory.containsSingleton(GUARD_BEAN_NAME)) {
                throw new IllegalStateException(GUARD_REGISTRATION_REJECTED);
            }
            var guard = registry.getBeanDefinition(GUARD_BEAN_NAME);
            registry.removeBeanDefinition(GUARD_BEAN_NAME);
            registry.registerBeanDefinition(GUARD_BEAN_NAME, guard);
        };
    }

    @Bean(name = GUARD_BEAN_NAME)
    @Order(Ordered.LOWEST_PRECEDENCE)
    MongoClientSettingsBuilderCustomizer ownedMongoConnectionGuard(
            OwnedMongoDBContainer container, MongoConnectionDetails connection,
            ConfigurableListableBeanFactory beanFactory) {
        return new MongoClientSettingsBuilderCustomizer() {
            @Override
            public void customize(MongoClientSettings.Builder builder) {
                // Resolve only during customization, after this bean has been created.
                // An injected provider excludes its requesting bean; a factory lookup includes this guard.
                // A tied/unordered trailing customizer must not bypass the endpoint check.
                requireLastCustomizer(this, beanFactory.getBeanProvider(MongoClientSettingsBuilderCustomizer.class)
                        .orderedStream().toList());
                requireOwnedConnection(connection.getConnectionString(), builder.build(),
                        container.getHost(), container.getMappedPort(MONGO_PORT));
            }
        };
    }

    static void requireLastCustomizer(MongoClientSettingsBuilderCustomizer guard,
            List<MongoClientSettingsBuilderCustomizer> customizers) {
        if (customizers.isEmpty() || customizers.getLast() != guard) {
            throw new IllegalStateException(CUSTOMIZER_ORDER_REJECTED);
        }
    }

    static void requireDockerAvailable(BooleanSupplier available) {
        final boolean present;
        try {
            present = available.getAsBoolean();
        } catch (RuntimeException ignored) {
            throw new IllegalStateException(DOCKER_REQUIRED);
        }
        if (!present) {
            throw new IllegalStateException(DOCKER_REQUIRED);
        }
    }

    static void requireLocalDockerEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            return;
        }
        try {
            URI uri = URI.create(endpoint);
            if (uri.getUserInfo() == null && (("unix".equals(uri.getScheme())
                    && uri.getRawAuthority() == null && uri.getPath() != null && uri.getPath().startsWith("/"))
                    || (("tcp".equals(uri.getScheme()) || "http".equals(uri.getScheme())
                            || "https".equals(uri.getScheme())) && isLoopback(uri.getHost())))) {
                return;
            }
        } catch (IllegalArgumentException ignored) {
            // Never echo endpoint/configuration values or attach the raw exception.
        }
        throw new IllegalStateException("Backend integration tests require a local Docker endpoint.");
    }

    static boolean isLoopback(String host) {
        return host != null && List.of("localhost", "127.0.0.1", "::1", "[::1]")
                .contains(host.toLowerCase(Locale.ROOT));
    }

    static void requireOwnedConnection(ConnectionString connection, MongoClientSettings settings,
            String host, int port) {
        if (!isLoopback(host) || port <= 0 || port == MONGO_PORT
                || connection.isSrvProtocol()
                || !connection.getHosts().equals(List.of(host + ":" + port))
                || settings.getClusterSettings().getSrvHost() != null
                || !settings.getClusterSettings().getHosts().equals(List.of(new ServerAddress(host, port)))) {
            throw new IllegalStateException(CONNECTION_REJECTED);
        }
    }

    /** Spring, not a JUnit container extension, owns start/stop and context caching. */
    public static final class OwnedMongoDBContainer extends MongoDBContainer {

        public OwnedMongoDBContainer() {
            super(IMAGE);
            withStartupAttempts(1);
            withStartupTimeout(Duration.ofSeconds(60));
            withReuse(false);
            withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                    new PortBinding(Ports.Binding.bindIpAndPort("127.0.0.1", 0), new ExposedPort(MONGO_PORT))));
        }

        @Override
        public void start() {
            requireLocalDockerEndpoint(System.getenv("DOCKER_HOST"));
            requireLocalDockerEndpoint(System.getProperty("docker.host"));
            // Include Testcontainers' user-property overrides without printing values.
            var configuration = TestcontainersConfiguration.getInstance();
            requireLocalDockerEndpoint(configuration.getEnvVarOrUserProperty("docker.host", null));
            requireLocalDockerEndpoint(configuration.getEnvVarOrUserProperty("tc.host", null));
            String hostOverride = System.getenv("TESTCONTAINERS_HOST_OVERRIDE");
            if (hostOverride != null && !hostOverride.isBlank() && !isLoopback(hostOverride)) {
                throw new IllegalStateException(CONNECTION_REJECTED);
            }
            requireDockerAvailable(() -> DockerClientFactory.instance().isDockerAvailable());
            try {
                // Check the resolved host as well as explicit endpoint overrides.
                if (!isLoopback(getHost())) {
                    throw new IllegalStateException(CONNECTION_REJECTED);
                }
                super.start();
            } catch (RuntimeException ignored) {
                // Partial startup resources belong to this instance only.
                try {
                    super.stop();
                } catch (RuntimeException cleanupFailure) {
                    throw new IllegalStateException(START_FAILED + " Owned-container cleanup also failed.");
                }
                throw new IllegalStateException(START_FAILED);
            }
        }
    }
}
