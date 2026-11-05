package com.vaibhav.springreactdemo.product;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;
import com.vaibhav.springreactdemo.product.dto.ProductUpdateRequest;

@Component
public class ProductMapper {

    public Product toEntity(ProductRequest request) {
        Product product = new Product();
        apply(request, product);
        return product;
    }

    public void updateEntity(ProductUpdateRequest request, Product product) {
        apply(request.name(), request.description(), request.category(), request.price(), request.stock(),
                request.tags(), request.specs(), request.active(), product);
    }

    public ProductResponse toResponse(Product product) {
        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getCategory(),
                product.getPrice(),
                product.getStock(),
                product.getTags(),
                product.getSpecs(),
                product.isActive(),
                product.getCreatedAt(),
                product.getUpdatedAt(),
                product.getVersion());
    }

    private void apply(ProductRequest request, Product product) {
        apply(request.name(), request.description(), request.category(), request.price(), request.stock(),
                request.tags(), request.specs(), request.active(), product);
    }

    private void apply(String name, String description, String category, BigDecimal price, Integer stock,
            List<String> tags, Map<String, Object> specs, Boolean active, Product product) {
        product.setName(name);
        product.setDescription(description);
        product.setCategory(category);
        product.setPrice(price);
        product.setStock(stock);
        product.setTags(tags);
        product.setSpecs(specs);
        product.setActive(active);
    }
}
