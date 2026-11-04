package com.vaibhav.springreactdemo.product;

import org.springframework.stereotype.Component;

import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;

@Component
public class ProductMapper {

    public Product toEntity(ProductRequest request) {
        Product product = new Product();
        apply(request, product);
        return product;
    }

    public void updateEntity(ProductRequest request, Product product) {
        apply(request, product);
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
                product.getUpdatedAt());
    }

    private void apply(ProductRequest request, Product product) {
        product.setName(request.name());
        product.setDescription(request.description());
        product.setCategory(request.category());
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setTags(request.tags());
        product.setSpecs(request.specs());
        product.setActive(request.active());
    }
}
