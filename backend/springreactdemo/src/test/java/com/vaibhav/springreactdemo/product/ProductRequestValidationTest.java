package com.vaibhav.springreactdemo.product;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.vaibhav.springreactdemo.product.dto.ProductRequest;

class ProductRequestValidationTest {

    private static jakarta.validation.ValidatorFactory validatorFactory;
    private static Validator validator;

    @BeforeAll
    static void createValidator() {
        validatorFactory = Validation.buildDefaultValidatorFactory();
        validator = validatorFactory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        validatorFactory.close();
    }

    @Test
    void rejectsInvalidRequiredFieldsAndPricePrecision() {
        ProductRequest request = new ProductRequest(
                " ", null, "Category", new BigDecimal("1234567890123.00"), -1,
                null, null, true);

        Set<String> invalidFields = validator.validate(request).stream()
                .map(error -> error.getPropertyPath().toString())
                .collect(Collectors.toSet());

        assertTrue(invalidFields.contains("name"));
        assertTrue(invalidFields.contains("price"));
        assertTrue(invalidFields.contains("stock"));
    }

    @Test
    void rejectsMongoOperatorKeysAndDeepOrOversizedSpecs() {
        ProductRequest unsafeKey = validRequest(Map.of("$where", "return true"));
        ProductRequest tooDeep = validRequest(Map.of("level1", Map.of("level2", Map.of("level3", Map.of("leaf", true)))));
        ProductRequest tooLong = validRequest(Map.of("description", "x".repeat(501)));

        assertFalse(validator.validate(unsafeKey).isEmpty());
        assertFalse(validator.validate(tooDeep).isEmpty());
        assertFalse(validator.validate(tooLong).isEmpty());
        assertTrue(validator.validate(validRequest(Map.of("capacityLitres", 28, "features", List.of("light", "waterproof"))))
                .isEmpty());
    }

    private ProductRequest validRequest(Map<String, Object> specs) {
        return new ProductRequest("Product", "Description", "Category", new BigDecimal("10.00"),
                4, List.of("tag"), specs, true);
    }
}
