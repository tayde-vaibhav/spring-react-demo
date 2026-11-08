package com.vaibhav.springreactdemo.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import java.net.URI;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.parallel.Isolated;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.core.MethodParameter;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.converter.json.ProblemDetailJacksonMixin;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.vaibhav.springreactdemo.product.ProductNotFoundException;
import com.vaibhav.springreactdemo.product.ProductController;
import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.security.InvalidCredentialsException;
import com.vaibhav.springreactdemo.security.LoginRateLimitException;

import tools.jackson.databind.json.JsonMapper;

@Isolated("Temporarily changes the default locale; always restores it")
class ApiExceptionHandlerContractTest {

    private static final JsonMapper JSON = JsonMapper.builder()
            .addMixIn(ProblemDetail.class, ProblemDetailJacksonMixin.class).build();

    static Stream<Arguments> contracts() {
        return Stream.of(Locale.ROOT, Locale.ENGLISH, Locale.forLanguageTag("tr-TR")).flatMap(locale -> Stream.of(
                Arguments.of(locale, "validation", 400, "Request validation failed", "urn:problem:request-validation-failed",
                        "One or more request fields are invalid."),
                Arguments.of(locale, "body", 400, "Invalid request body", "urn:problem:invalid-request-body",
                        "The request body is missing or is not valid JSON."),
                Arguments.of(locale, "parameters", 400, "Invalid request parameters", "urn:problem:invalid-request-parameters",
                        "Request parameters are invalid."),
                Arguments.of(locale, "unauthorized", 401, "Authentication required", "urn:problem:authentication-required",
                        "Authentication failed or is required to access this resource."),
                Arguments.of(locale, "invalidCredentials", 401, "Authentication required", "urn:problem:authentication-required",
                        "Authentication failed or is required to access this resource."),
                Arguments.of(locale, "forbidden", 403, "Access denied", "urn:problem:access-denied",
                        "You do not have permission to access this resource."),
                Arguments.of(locale, "product", 404, "Product not found", "urn:problem:product-not-found",
                        "Product not found: qa-id"),
                Arguments.of(locale, "resource", 404, "Resource not found", "urn:problem:resource-not-found",
                        "The requested resource was not found."),
                Arguments.of(locale, "conflict", 409, "Concurrent update conflict", "urn:problem:concurrent-update-conflict",
                        "The product changed while this update was being saved. Reload and retry."),
                Arguments.of(locale, "rateLimit", 429, "Too many login attempts", "urn:problem:too-many-login-attempts",
                        "Please wait before trying to log in again."),
                Arguments.of(locale, "media", 415, "Unsupported media type", "urn:problem:unsupported-media-type",
                        "The request content type is not supported.")));
    }

    @ParameterizedTest
    @MethodSource("contracts")
    void exactExistingTypesTitlesStatusesDetailsAndFieldsDoNotChange(Locale locale, String kind,
            int status, String title, String type, String detail) throws Exception {
        Locale previous = Locale.getDefault();
        Locale previousDisplay = Locale.getDefault(Locale.Category.DISPLAY);
        Locale previousFormat = Locale.getDefault(Locale.Category.FORMAT);
        try {
            Locale.setDefault(locale);
            var request = new MockHttpServletRequest("GET", "/api/v1/products/qa-id");
            ProblemDetail result = problem(kind, request);
            assertEquals(URI.create(type), result.getType());
            assertEquals(status, result.getStatus());
            assertEquals(title, result.getTitle());
            assertEquals(detail, result.getDetail());
            assertEquals(URI.create("/api/v1/products/qa-id"), result.getInstance());
            Map<?, ?> fields = JSON.readValue(JSON.writeValueAsString(result), Map.class);
            Set<String> expectedFields = "validation".equals(kind)
                    ? Set.of("type", "title", "status", "detail", "instance", "errors")
                    : Set.of("type", "title", "status", "detail", "instance");
            assertEquals(expectedFields, fields.keySet());
            assertEquals(type, fields.get("type"));
            if ("validation".equals(kind)) {
                assertEquals(Map.of("name", "Must not be blank"), fields.get("errors"));
            }
        } finally {
            Locale.setDefault(previous);
            Locale.setDefault(Locale.Category.DISPLAY, previousDisplay);
            Locale.setDefault(Locale.Category.FORMAT, previousFormat);
        }
    }

    private static ProblemDetail problem(String kind, HttpServletRequest request) throws Exception {
        var handler = new ApiExceptionHandler();
        return switch (kind) {
            case "validation" -> {
                var binding = new BeanPropertyBindingResult(new Object(), "request");
                binding.addError(new FieldError("request", "name", "Must not be blank"));
                var method = ProductController.class.getDeclaredMethod("create", ProductRequest.class);
                yield handler.handleValidation(new MethodArgumentNotValidException(new MethodParameter(method, 0), binding), request);
            }
            case "body" -> handler.handleUnreadableBody(new HttpMessageNotReadableException("test-only",
                    new MockHttpInputMessage(new byte[0])), request);
            case "parameters" -> handler.handleBadRequest(new IllegalArgumentException(), request);
            case "unauthorized" -> handler.handleUnauthorized(new BadCredentialsException("test-only"), request);
            case "invalidCredentials" -> handler.handleUnauthorized(new InvalidCredentialsException(), request);
            case "forbidden" -> handler.handleForbidden(new AccessDeniedException("test-only"), request);
            case "product" -> handler.handleNotFound(new ProductNotFoundException("qa-id"), request);
            case "resource" -> handler.handleResourceNotFound(mock(NoResourceFoundException.class), request);
            case "conflict" -> handler.handleOptimisticLock(new OptimisticLockingFailureException("test-only"), request);
            case "rateLimit" -> handler.handleRateLimit(new LoginRateLimitException(), request);
            case "media" -> handler.handleUnsupportedMediaType(
                    new HttpMediaTypeNotSupportedException(MediaType.TEXT_PLAIN, java.util.List.of(MediaType.APPLICATION_JSON)), request);
            default -> throw new AssertionError("Unknown test contract");
        };
    }
}
