package com.vaibhav.springreactdemo.product;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.ActiveProfiles;

import com.vaibhav.springreactdemo.support.MongoContainerTestConfiguration;
import com.vaibhav.springreactdemo.support.MongoTestIsolationInitializer;

@SpringBootTest
@ActiveProfiles("test")
@Import(MongoContainerTestConfiguration.class)
class MongoProductPersistenceIntegrationTest {

    @Autowired
    private ProductRepository repository;

    @Autowired
    private MongoTemplate mongo;

    @Test
    void qaOwnedProductRoundTripPreservesAuditingAndVersion() {
        assertEquals(MongoTestIsolationInitializer.DATABASE_NAME, mongo.getDb().getName());
        long baseline = repository.count();
        String name = "qa-i2-" + UUID.randomUUID();
        var ownership = Query.query(Criteria.where("name").is(name).and("category").is("qa-i2"));
        var product = new Product();
        product.setName(name);
        product.setDescription("QA-owned isolated persistence fixture");
        product.setCategory("qa-i2");
        product.setPrice(new BigDecimal("129.95"));
        product.setStock(3);
        product.setTags(List.of("qa", "isolated"));
        product.setSpecs(Map.of("dimensions", Map.of("widthCm", 30)));
        product.setActive(true);
        try {
            Product saved = repository.save(product);
            assertNotNull(saved.getId());
            assertTrue(saved.getId().matches("[a-f0-9]{24}"));
            assertEquals(Long.valueOf(0), saved.getVersion());
            assertNotNull(saved.getCreatedAt());
            assertNotNull(saved.getUpdatedAt());
            Product initialGet = repository.findById(saved.getId()).orElseThrow();
            assertEquals(0, product.getPrice().compareTo(initialGet.getPrice()));
            assertEquals(product.getTags(), initialGet.getTags());
            assertEquals(product.getSpecs(), initialGet.getSpecs());
            // Mongo persists milliseconds: compare the POST/save precision accordingly.
            assertEquals(saved.getCreatedAt().toEpochMilli(), initialGet.getCreatedAt().toEpochMilli());
            assertEquals(saved.getUpdatedAt().toEpochMilli(), initialGet.getUpdatedAt().toEpochMilli());
            Product stale = repository.findById(saved.getId()).orElseThrow();
            initialGet.setStock(4);
            Product updated = repository.save(initialGet);
            assertEquals(Long.valueOf(1), updated.getVersion());
            Product afterUpdate = repository.findById(saved.getId()).orElseThrow();
            assertEquals(stale.getCreatedAt(), afterUpdate.getCreatedAt());
            assertFalse(afterUpdate.getUpdatedAt().isBefore(stale.getUpdatedAt()));
            assertEquals(updated.getUpdatedAt().toEpochMilli(), afterUpdate.getUpdatedAt().toEpochMilli());
            assertThrows(OptimisticLockingFailureException.class, () -> repository.save(stale));
            Product afterConflict = repository.findById(saved.getId()).orElseThrow();
            assertEquals(afterUpdate.getVersion(), afterConflict.getVersion());
            assertEquals(afterUpdate.getStock(), afterConflict.getStock());
            assertEquals(afterUpdate.getCreatedAt(), afterConflict.getCreatedAt());
            assertEquals(afterUpdate.getUpdatedAt(), afterConflict.getUpdatedAt());
            assertEquals(baseline + 1, repository.count());
        } finally {
            // Exact qa-name/category ownership also covers a write whose response failed.
            mongo.remove(ownership, Product.class);
            assertFalse(mongo.exists(ownership, Product.class));
            assertEquals(baseline, repository.count());
        }
    }
}
