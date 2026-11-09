package com.vaibhav.springreactdemo.support;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import com.github.dockerjava.api.model.ExposedPort;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.mongodb.autoconfigure.MongoConnectionDetails;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties = {
        "MONGODB_URI=mongodb://127.0.0.1:1/qa-unselected-dev",
        "MONGODB_TEST_URI=mongodb://127.0.0.1:1/qa-unselected-test",
        "spring.mongodb.uri=mongodb://127.0.0.1:1/qa-unselected-direct",
        "spring.mongodb.database=qa-unselected-database"
})
@ActiveProfiles("test")
@Import(MongoContainerTestConfiguration.class)
class MongoContainerIsolationIntegrationTest {

    @Autowired
    private MongoContainerTestConfiguration.OwnedMongoDBContainer container;

    @Autowired
    private MongoConnectionDetails connection;

    @Autowired
    private MongoTemplate mongo;

    @Autowired
    private Environment environment;

    @Test
    void ownedContainerConnectionRespondsToPing() {
        assertTrue(container.isRunning());
        var response = mongo.executeCommand(new Document("ping", 1));
        assertEquals(1.0, ((Number) response.get("ok")).doubleValue());
        assertEquals(MongoTestIsolationInitializer.DATABASE_NAME, mongo.getDb().getName());
    }

    @Test
    void containerConnectionOverridesExternalMongoSettings() {
        int port = container.getMappedPort(MongoContainerTestConfiguration.MONGO_PORT);
        assertTrue(port > 0 && port != 27017, "Must not address the shared development port");
        assertTrue(connection.getConnectionString().getHosts().equals(List.of(container.getHost() + ":" + port)),
                "Service details must address this container, not external configuration");
        assertEquals(MongoTestIsolationInitializer.REQUIRED_URI, environment.getProperty("spring.mongodb.uri"));
        assertEquals(MongoTestIsolationInitializer.DATABASE_NAME, mongo.getDb().getName());
        // Inspect only the owned container's public port metadata; never its environment/logs.
        var bindings = container.getContainerInfo().getNetworkSettings().getPorts().getBindings()
                .get(new ExposedPort(MongoContainerTestConfiguration.MONGO_PORT));
        assertNotNull(bindings);
        assertEquals(1, bindings.length);
        assertEquals("127.0.0.1", bindings[0].getHostIp());
        assertTrue(Integer.parseInt(bindings[0].getHostPortSpec()) == port);
    }
}
