package com.vaibhav.springreactdemo.product;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface ProductRepository extends MongoRepository<Product, String> {

    List<Product> findByCategory(String category);

    List<Product> findByPriceBetween(BigDecimal minimumPrice, BigDecimal maximumPrice);

    List<Product> findByNameContainingIgnoreCase(String name);
}
