package com.vaibhav.springreactdemo.product.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public record ProductResponse(
        String id,
        String name,
        String description,
        String category,
        BigDecimal price,
        int stock,
        List<String> tags,
        Map<String, Object> specs,
        boolean active,
        Instant createdAt,
        Instant updatedAt,
        Long version) {
}
