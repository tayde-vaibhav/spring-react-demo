package com.vaibhav.springreactdemo.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;

import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private MongoTemplate mongoTemplate;

    private ProductService productService;

    @BeforeEach
    void setUp() {
        productService = new ProductService(productRepository, mongoTemplate, new ProductMapper());
    }

    @Test
    void createMapsAndPersistsProduct() {
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = productService.create(validRequest());

        assertEquals("Trail Backpack", response.name());
        assertEquals("Outdoor", response.category());
        assertEquals(new BigDecimal("79.95"), response.price());
        verify(productRepository).save(any(Product.class));
    }

    @Test
    void getByIdThrowsWhenProductDoesNotExist() {
        when(productRepository.findById("missing-id")).thenReturn(Optional.empty());

        assertThrows(ProductNotFoundException.class, () -> productService.getById("missing-id"));
    }

    @Test
    void updateChangesExistingProduct() {
        Product existing = new Product();
        existing.setId("product-1");
        existing.setName("Old name");
        when(productRepository.findById("product-1")).thenReturn(Optional.of(existing));
        when(productRepository.save(existing)).thenReturn(existing);

        ProductResponse response = productService.update("product-1", validRequest());

        assertEquals("product-1", response.id());
        assertEquals("Trail Backpack", response.name());
    }

    @Test
    void deleteRemovesExistingProduct() {
        Product existing = new Product();
        existing.setId("product-1");
        when(productRepository.findById("product-1")).thenReturn(Optional.of(existing));

        productService.delete("product-1");

        verify(productRepository).delete(existing);
    }

    @Test
    void searchCapsRequestedPageSizeAtOneHundred() {
        when(mongoTemplate.count(any(Query.class), eq(Product.class))).thenReturn(0L);
        when(mongoTemplate.find(any(Query.class), eq(Product.class))).thenReturn(List.of());

        var response = productService.search(null, null, null, null,
                PageRequest.of(0, 500, Sort.by("name")));

        assertEquals(100, response.size());
        assertEquals(0, response.totalElements());
        assertEquals(0, response.totalPages());
        ArgumentCaptor<Query> query = ArgumentCaptor.forClass(Query.class);
        verify(mongoTemplate).find(query.capture(), eq(Product.class));
        assertEquals(100, query.getValue().getLimit());
    }

    @Test
    void searchAppliesFiltersStableSortAndBoundedOffset() {
        when(mongoTemplate.count(any(Query.class), eq(Product.class))).thenReturn(40L);
        when(mongoTemplate.find(any(Query.class), eq(Product.class))).thenReturn(List.of());

        productService.search("Outdoor", new BigDecimal("10.00"), new BigDecimal("100.00"), "backpack",
                PageRequest.of(1, 20, Sort.by(Sort.Direction.ASC, "price")));

        ArgumentCaptor<Query> query = ArgumentCaptor.forClass(Query.class);
        verify(mongoTemplate).find(query.capture(), eq(Product.class));
        Query executed = query.getValue();
        assertEquals(20, executed.getLimit());
        assertEquals(20, executed.getSkip());
        assertEquals("Outdoor", executed.getQueryObject().get("category"));
        assertEquals(true, executed.getQueryObject().containsKey("$text"));
        assertEquals(true, executed.getSortObject().containsKey("price"));
        assertEquals(true, executed.getSortObject().containsKey("id"));
    }

    @Test
    void searchRejectsExcessiveOffsetAndUnknownSortFields() {
        assertThrows(IllegalArgumentException.class,
                () -> productService.search(null, null, null, null, PageRequest.of(101, 100)));
        assertThrows(IllegalArgumentException.class,
                () -> productService.search(null, null, null, null, PageRequest.of(0, 20, Sort.by("passwordHash"))));
    }

    private ProductRequest validRequest() {
        return new ProductRequest(
                "Trail Backpack",
                "Lightweight day pack for hiking.",
                "Outdoor",
                new BigDecimal("79.95"),
                25,
                List.of("hiking", "travel"),
                Map.of("capacityLitres", 28),
                true);
    }
}
