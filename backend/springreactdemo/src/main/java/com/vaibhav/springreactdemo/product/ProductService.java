package com.vaibhav.springreactdemo.product;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.TextCriteria;
import org.springframework.stereotype.Service;

import com.vaibhav.springreactdemo.product.dto.ProductCategoryStatsResponse;
import com.vaibhav.springreactdemo.product.dto.ProductPageResponse;
import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;
import com.vaibhav.springreactdemo.product.dto.ProductUpdateRequest;
import org.springframework.dao.OptimisticLockingFailureException;

@Service
public class ProductService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final long MAX_PAGE_OFFSET = 10_000;
    private static final int MAX_TEXT_QUERY_LENGTH = 100;
    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "id", "name", "category", "price", "stock", "createdAt", "updatedAt");

    private final ProductRepository productRepository;
    private final MongoTemplate mongoTemplate;
    private final ProductMapper productMapper;

    public ProductService(ProductRepository productRepository, MongoTemplate mongoTemplate, ProductMapper productMapper) {
        this.productRepository = productRepository;
        this.mongoTemplate = mongoTemplate;
        this.productMapper = productMapper;
    }

    public ProductResponse create(ProductRequest request) {
        return productMapper.toResponse(productRepository.save(productMapper.toEntity(request)));
    }

    public ProductResponse getById(String id) {
        return productMapper.toResponse(findProduct(id));
    }

    public ProductResponse update(String id, ProductUpdateRequest request) {
        Product product = findProduct(id);
        if (!Objects.equals(product.getVersion(), request.version())) {
            throw new OptimisticLockingFailureException("Product version is stale");
        }
        productMapper.updateEntity(request, product);
        return productMapper.toResponse(productRepository.save(product));
    }

    public void delete(String id) {
        productRepository.delete(findProduct(id));
    }

    public ProductPageResponse search(String category, BigDecimal minPrice, BigDecimal maxPrice,
            String textQuery, Pageable requestedPageable) {
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0) {
            throw new IllegalArgumentException("minPrice must not be greater than maxPrice");
        }
        if (textQuery != null && textQuery.length() > MAX_TEXT_QUERY_LENGTH) {
            throw new IllegalArgumentException("q must not exceed " + MAX_TEXT_QUERY_LENGTH + " characters");
        }
        if ((minPrice != null && minPrice.signum() < 0) || (maxPrice != null && maxPrice.signum() < 0)) {
            throw new IllegalArgumentException("Price filters must be non-negative");
        }
        if (category != null && category.length() > 100) {
            throw new IllegalArgumentException("category must not exceed 100 characters");
        }

        Pageable pageable = boundedPageable(requestedPageable);
        Query resultsQuery = buildSearchQuery(category, minPrice, maxPrice, textQuery);
        long totalElements = mongoTemplate.count(
                buildSearchQuery(category, minPrice, maxPrice, textQuery), Product.class);
        List<ProductResponse> content = mongoTemplate.find(resultsQuery.with(pageable), Product.class)
                .stream()
                .map(productMapper::toResponse)
                .toList();
        int totalPages = (int) Math.ceil((double) totalElements / pageable.getPageSize());

        return new ProductPageResponse(
                content,
                pageable.getPageNumber(),
                pageable.getPageSize(),
                totalElements,
                totalPages,
                pageable.getPageNumber() == 0,
                totalPages == 0 || pageable.getPageNumber() + 1 >= totalPages);
    }

    public List<ProductCategoryStatsResponse> getStats() {
        Aggregation aggregation = Aggregation.newAggregation(
                Aggregation.group("category")
                        .count().as("count")
                        .avg("price").as("averagePrice"),
                Aggregation.project("count", "averagePrice")
                        .and("_id").as("category"),
                Aggregation.sort(Sort.Direction.ASC, "category"));
        AggregationResults<ProductCategoryStatsResponse> results = mongoTemplate.aggregate(
                aggregation, Product.class, ProductCategoryStatsResponse.class);
        return results.getMappedResults();
    }

    private Product findProduct(String id) {
        return productRepository.findById(id).orElseThrow(() -> new ProductNotFoundException(id));
    }

    private Pageable boundedPageable(Pageable pageable) {
        int size = Math.min(pageable.getPageSize(), MAX_PAGE_SIZE);
        long offset = (long) pageable.getPageNumber() * size;
        if (offset > MAX_PAGE_OFFSET) {
            throw new IllegalArgumentException("Requested page offset exceeds " + MAX_PAGE_OFFSET);
        }
        Sort sort = pageable.getSort();
        for (Sort.Order order : sort) {
            if (!ALLOWED_SORT_FIELDS.contains(order.getProperty())) {
                throw new IllegalArgumentException("Unsupported sort field");
            }
        }
        if (sort.getOrderFor("id") == null) {
            sort = sort.and(Sort.by(Sort.Direction.ASC, "id"));
        }
        return PageRequest.of(pageable.getPageNumber(), size, sort);
    }

    private Query buildSearchQuery(String category, BigDecimal minPrice, BigDecimal maxPrice, String textQuery) {
        Query query = new Query();
        if (category != null && !category.isBlank()) {
            query.addCriteria(Criteria.where("category").is(category));
        }
        if (minPrice != null || maxPrice != null) {
            Criteria priceCriteria = Criteria.where("price");
            if (minPrice != null) {
                priceCriteria.gte(minPrice);
            }
            if (maxPrice != null) {
                priceCriteria.lte(maxPrice);
            }
            query.addCriteria(priceCriteria);
        }
        if (textQuery != null && !textQuery.isBlank()) {
            query.addCriteria(TextCriteria.forDefaultLanguage().matching(textQuery.trim()));
        }
        return query;
    }
}
