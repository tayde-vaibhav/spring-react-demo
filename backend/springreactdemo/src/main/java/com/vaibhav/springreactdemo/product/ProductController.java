package com.vaibhav.springreactdemo.product;

import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.vaibhav.springreactdemo.product.dto.ProductCategoryStatsResponse;
import com.vaibhav.springreactdemo.product.dto.ProductPageResponse;
import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;
import com.vaibhav.springreactdemo.product.dto.ProductUpdateRequest;

@RestController
@RequestMapping("/api/v1/products")
public class ProductController {

    private static final Set<String> ALLOWED_SEARCH_PARAMETERS = Set.of(
            "category", "minPrice", "maxPrice", "q", "page", "size", "sort");

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @PostMapping
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody ProductRequest request) {
        ProductResponse created = productService.create(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(created.id())
                .toUri();
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping("/{id}")
    public ProductResponse getById(@PathVariable String id) {
        return productService.getById(id);
    }

    @PutMapping("/{id}")
    public ProductResponse update(@PathVariable String id, @Valid @RequestBody ProductUpdateRequest request) {
        return productService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        productService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ProductPageResponse search(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false, name = "q") String textQuery,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable,
            HttpServletRequest request) {
        validateSearchParameterNames(request.getParameterMap());
        return productService.search(category, minPrice, maxPrice, textQuery, pageable);
    }

    @GetMapping("/stats")
    public List<ProductCategoryStatsResponse> getStats() {
        return productService.getStats();
    }

    private void validateSearchParameterNames(Map<String, String[]> parameters) {
        for (Map.Entry<String, String[]> parameter : parameters.entrySet()) {
            if (!ALLOWED_SEARCH_PARAMETERS.contains(parameter.getKey())) {
                throw new IllegalArgumentException("Unsupported search parameter");
            }
            if (!"sort".equals(parameter.getKey()) && parameter.getValue().length > 1) {
                throw new IllegalArgumentException("Search parameter must not be repeated: " + parameter.getKey());
            }
        }
    }
}
