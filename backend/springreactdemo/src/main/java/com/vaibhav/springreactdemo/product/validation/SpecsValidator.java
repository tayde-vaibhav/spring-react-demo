package com.vaibhav.springreactdemo.product.validation;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class SpecsValidator implements ConstraintValidator<ValidSpecs, Map<String, Object>> {

    private static final int MAX_DEPTH = 3;
    private static final int MAX_ENTRIES = 30;
    private static final int MAX_LIST_SIZE = 50;
    private static final Pattern SAFE_KEY = Pattern.compile("[A-Za-z][A-Za-z0-9_-]{0,49}");

    @Override
    public boolean isValid(Map<String, Object> specs, ConstraintValidatorContext context) {
        return specs == null || validMap(specs, 1);
    }

    private boolean validMap(Map<?, ?> map, int depth) {
        if (depth > MAX_DEPTH || map.size() > MAX_ENTRIES) {
            return false;
        }
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!(entry.getKey() instanceof String key) || !SAFE_KEY.matcher(key).matches()
                    || !validValue(entry.getValue(), depth)) {
                return false;
            }
        }
        return true;
    }

    private boolean validValue(Object value, int depth) {
        if (value == null || value instanceof Boolean) {
            return true;
        }
        if (value instanceof String text) {
            return text.length() <= 500;
        }
        if (value instanceof Number number) {
            try {
                BigDecimal decimal = new BigDecimal(number.toString());
                return decimal.precision() <= 18 && decimal.scale() <= 6;
            } catch (NumberFormatException exception) {
                return false;
            }
        }
        if (value instanceof Map<?, ?> nestedMap) {
            return validMap(nestedMap, depth + 1);
        }
        if (value instanceof List<?> list) {
            return depth < MAX_DEPTH && list.size() <= MAX_LIST_SIZE
                    && list.stream().allMatch(item -> validValue(item, depth + 1));
        }
        return false;
    }
}
