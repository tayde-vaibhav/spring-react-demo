package com.vaibhav.springreactdemo.product.dto;

import java.math.BigDecimal;

public record ProductCategoryStatsResponse(String category, long count, BigDecimal averagePrice) {
}
