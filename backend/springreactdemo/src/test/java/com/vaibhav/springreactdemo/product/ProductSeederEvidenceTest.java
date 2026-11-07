package com.vaibhav.springreactdemo.product;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.mock.env.MockEnvironment;

import com.vaibhav.springreactdemo.product.dto.ProductResponse;
import com.vaibhav.springreactdemo.product.validation.SpecsValidator;

/** Isolated dev-fixture evidence: no Boot auto-configuration, Mongo client or environment credentials. */
class ProductSeederEvidenceTest {

    private static final Map<String, Set<String>> SPEC_KEYS = Map.of(
            "Electronics", Set.of("brand", "color", "connectivity", "warrantyYears"),
            "Clothing", Set.of("size", "material", "color", "fit"),
            "Home & Kitchen", Set.of("material", "color", "room", "assemblyRequired"),
            "Books", Set.of("author", "format", "pages", "language"),
            "Sports & Outdoors", Set.of("sport", "material", "weightGrams", "color"),
            "Beauty & Personal Care", Set.of("skinType", "volumeMl", "formulation", "crueltyFree"),
            "Toys & Games", Set.of("ageRange", "material", "pieces", "educational"),
            "Grocery", Set.of("unitSize", "dietary", "shelfStable", "origin"),
            "Office Supplies", Set.of("paperSize", "color", "packQuantity", "recycled"));

    @ParameterizedTest
    @ValueSource(strings = {"dev", "test", "production", "none"})
    void componentExistsOnlyWithDevProfileAndDefaultCountIs500(String profile) {
        var capture = fixture();
        try (var context = context(profile, capture, Map.of())) {
            assertEquals(profile.equals("dev") ? 1 : 0, context.getBeansOfType(ProductSeeder.class).size());
            assertTrue(context.getBeansOfType(com.mongodb.client.MongoClient.class).isEmpty());
            if (profile.equals("dev")) {
                context.getBean(ProductSeeder.class).run();
                assertEquals(500, capture.products().size());
                assertEquals(List.of(100, 100, 100, 100, 100), capture.batchSizes());
            } else {
                verifyNoInteractions(capture.repository());
                // Registering the mock as a bean invokes this lifecycle callback, not a DB operation.
                verify(capture.mongo()).setApplicationContext(context);
                verifyNoMoreInteractions(capture.mongo());
            }
        }
    }

    @Test
    void explicitCountPropertyControlsTheDevBeanWithoutLoadingApplicationYaml() {
        var capture = fixture();
        try (var context = context("dev", capture, Map.of("app.seed.products.count", "101"))) {
            context.getBean(ProductSeeder.class).run();
            assertEquals(101, capture.products().size());
            assertEquals(List.of(100, 1), capture.batchSizes());
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 99, 100, 101, 500})
    void emptyCollectionGetsExactlyTheConfiguredCountInBoundedBatches(int count) {
        var capture = fixture();
        new ProductSeeder(capture.repository(), capture.mongo(), count).run();
        assertEquals(count, capture.products().size());
        assertEquals((count + 99) / 100, capture.batches().size());
        assertTrue(capture.batchSizes().stream().allMatch(size -> size > 0 && size <= 100));
        verify(capture.repository()).count();
        verifyNoMoreInteractions(capture.repository());
        verify(capture.mongo(), times((count + 99) / 100)).insertAll(anyCollection());
        verifyNoMoreInteractions(capture.mongo());
        var validator = new SpecsValidator();
        for (var product : capture.products()) {
            assertNotNull(product.getName());
            assertFalse(product.getName().isBlank());
            assertNotNull(product.getDescription());
            assertFalse(product.getDescription().isBlank());
            assertTrue(SPEC_KEYS.containsKey(product.getCategory()));
            assertEquals(SPEC_KEYS.get(product.getCategory()), product.getSpecs().keySet());
            assertTrue(validator.isValid(product.getSpecs(), null));
            assertTrue(product.getPrice().compareTo(new BigDecimal("5.00")) >= 0);
            assertTrue(product.getPrice().compareTo(new BigDecimal("2000.00")) <= 0);
            assertEquals(2, product.getPrice().scale());
            assertTrue(product.getStock() >= 0 && product.getStock() <= 500);
            assertTrue(product.getTags().size() >= 2 && product.getTags().size() <= 5);
            assertEquals(product.getTags().size(), Set.copyOf(product.getTags()).size());
            // Mocks cannot supply ID/version/auditing evidence; these are not real DB inserts.
            assertNull(product.getId());
            assertNull(product.getVersion());
            assertNull(product.getCreatedAt());
            assertNull(product.getUpdatedAt());
        }
        if (count == 500) {
            assertEquals(SPEC_KEYS.keySet(), capture.products().stream()
                    .map(product -> Objects.requireNonNull(product).getCategory()).collect(Collectors.toSet()));
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1})
    void disabledCountDoesNotEvenConsultTheCollection(int count) {
        var repository = mock(ProductRepository.class);
        var mongo = mock(MongoTemplate.class);
        new ProductSeeder(repository, mongo, count).run();
        verifyNoInteractions(repository, mongo);
    }

    @ParameterizedTest
    @ValueSource(longs = {1, 500})
    void anyNonemptyCollectionPreventsSeeding(long existing) {
        var capture = fixture();
        when(capture.repository().count()).thenReturn(existing);
        new ProductSeeder(capture.repository(), capture.mongo(), 500).run();
        assertTrue(capture.batches().isEmpty());
        verify(capture.repository()).count();
        verifyNoInteractions(capture.mongo());
    }

    @Test
    void secondRunSkipsOnceTheMockCollectionReportsSeededProducts() {
        var capture = fixture();
        when(capture.repository().count()).thenReturn(0L, 500L);
        var seeder = new ProductSeeder(capture.repository(), capture.mongo(), 500);
        seeder.run();
        List<ProductResponse> first = snapshots(capture);
        seeder.run();
        assertEquals(first, snapshots(capture));
        assertEquals(500, capture.products().size());
        assertEquals(5, capture.batches().size());
        verify(capture.repository(), times(2)).count();
        verify(capture.mongo(), times(5)).insertAll(anyCollection());
    }

    @Test
    void freshRunsWithTheFixedSeedReproduceEveryGeneratedField() {
        var first = fixture();
        var second = fixture();
        new ProductSeeder(first.repository(), first.mongo(), 500).run();
        new ProductSeeder(second.repository(), second.mongo(), 500).run();
        assertEquals(500, snapshots(first).size());
        assertEquals(snapshots(first), snapshots(second));
    }

    private static List<ProductResponse> snapshots(Capture capture) {
        return capture.products().stream().map(new ProductMapper()::toResponse).toList();
    }

    private static AnnotationConfigApplicationContext context(String profile, Capture capture,
            Map<String, Object> properties) {
        var context = new AnnotationConfigApplicationContext();
        context.setEnvironment(new MockEnvironment());
        if (!profile.equals("none")) context.getEnvironment().setActiveProfiles(profile);
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("qa-seeder", properties));
        context.registerBean(ProductRepository.class, capture::repository);
        context.registerBean(MongoTemplate.class, capture::mongo);
        context.register(ProductSeeder.class);
        try {
            context.refresh();
            return context;
        } catch (RuntimeException | Error failure) {
            context.close();
            throw failure;
        }
    }

    private static Capture fixture() {
        var repository = mock(ProductRepository.class);
        var mongo = mock(MongoTemplate.class);
        var batches = new ArrayList<List<Product>>();
        when(repository.count()).thenReturn(0L);
        when(mongo.insertAll(anyCollection())).thenAnswer(invocation -> {
            Collection<?> incoming = invocation.getArgument(0);
            // Snapshot now: the seeder reuses and clears its batch list after each insertAll.
            var snapshot = incoming.stream().map(Product.class::cast).toList();
            batches.add(snapshot);
            return snapshot;
        });
        return new Capture(repository, mongo, batches);
    }

    private record Capture(ProductRepository repository, MongoTemplate mongo, List<List<Product>> batches) {
        List<Product> products() {
            return batches.stream().flatMap(batch -> Objects.requireNonNull(batch).stream()).toList();
        }

        List<Integer> batchSizes() {
            return batches.stream().map(batch -> Objects.requireNonNull(batch).size()).toList();
        }
    }
}
