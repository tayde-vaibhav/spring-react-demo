package com.vaibhav.springreactdemo.support;

import java.util.Map;

import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;

import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.Ordered;
import org.springframework.core.env.MapPropertySource;

/** Test-classpath-only guard; ordinary in-process/unit contexts do not load it. */
public final class MongoTestIsolationInitializer
        implements ApplicationContextInitializer<ConfigurableApplicationContext>, Ordered {

    static final String PROPERTY_SOURCE = "i2-owned-mongo-only";
    static final String REQUIRED_URI = "i2-owned-mongo-container-required";
    public static final String DATABASE_NAME = "qa_i2";
    static final String MISSING_WIRING = "Backend Boot tests require owned Mongo container wiring; "
            + "import MongoContainerTestConfiguration. External databases are not supported.";
    static final String CUSTOM_CLIENT_REJECTED = "Backend integration tests do not support custom Mongo client/settings beans.";

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        // Mask external URI/database values, including unresolved dev YAML placeholders.
        // This deliberately invalid URI cannot connect if the service connection is absent.
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(
                PROPERTY_SOURCE, Map.of("spring.mongodb.uri", REQUIRED_URI,
                        "spring.mongodb.database", DATABASE_NAME)));
        context.addBeanFactoryPostProcessor(factory -> {
            String name = MongoContainerTestConfiguration.CONTAINER_BEAN_NAME;
            Class<?> type = factory.containsBeanDefinition(name) ? factory.getType(name, false) : null;
            if (type == null || !MongoContainerTestConfiguration.OwnedMongoDBContainer.class.isAssignableFrom(type)) {
                throw new IllegalStateException(MISSING_WIRING);
            }
            requireAutoConfiguredClientDefinitions(factory);
        });
    }

    private static void requireAutoConfiguredClientDefinitions(ConfigurableListableBeanFactory factory) {
        // Explicit client/settings beans bypass Boot customization; reject rather than trust them.
        // Metadata lookup must not instantiate clients, settings or containers.
        for (Class<?> clientType : java.util.List.of(MongoClient.class, MongoClientSettings.class)) {
            for (String name : factory.getBeanNamesForType(clientType, true, false)) {
                String factoryName = factory.containsBeanDefinition(name)
                        ? factory.getBeanDefinition(name).getFactoryBeanName() : null;
                Class<?> configuration = factoryName == null ? null : factory.getType(factoryName, false);
                if (configuration == null
                        || !configuration.getName().startsWith("org.springframework.boot.mongodb.autoconfigure.")) {
                    throw new IllegalStateException(CUSTOM_CLIENT_REJECTED);
                }
            }
        }
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
