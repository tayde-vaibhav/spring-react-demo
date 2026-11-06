package com.vaibhav.springreactdemo.product.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import com.vaibhav.springreactdemo.product.validation.ValidSpecs;

public record ProductUpdateRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 2_000) String description,
        @NotBlank @Size(max = 100) String category,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal price,
        @NotNull @Min(0) Integer stock,
        @Size(max = 20) List<@NotBlank @Size(max = 50) String> tags,
        @Size(max = 30) @ValidSpecs Map<@NotBlank @Size(max = 50) String, Object> specs,
        @NotNull Boolean active,
        @NotNull @Min(0) Long version) {
}
