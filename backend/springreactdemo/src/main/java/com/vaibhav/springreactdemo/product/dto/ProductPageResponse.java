package com.vaibhav.springreactdemo.product.dto;

import java.util.List;

import com.vaibhav.springreactdemo.common.CollectionSnapshots;

public record ProductPageResponse(
        List<ProductResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last) {

    public ProductPageResponse {
        content = CollectionSnapshots.list(content);
    }

    @Override
    public List<ProductResponse> content() {
        return CollectionSnapshots.list(content);
    }
}
