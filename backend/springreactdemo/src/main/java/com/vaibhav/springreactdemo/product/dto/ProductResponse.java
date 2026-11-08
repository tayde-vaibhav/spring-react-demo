package com.vaibhav.springreactdemo.product.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.vaibhav.springreactdemo.common.CollectionSnapshots;

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

    public ProductResponse {
        tags = CollectionSnapshots.list(tags);
        specs = CollectionSnapshots.specs(specs);
    }

    @Override
    public List<String> tags() {
        return CollectionSnapshots.list(tags);
    }

    @Override
    public Map<String, Object> specs() {
        return CollectionSnapshots.specs(specs);
    }
}
