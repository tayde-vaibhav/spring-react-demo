package com.vaibhav.springreactdemo.security;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

class CookieSecurityContractTest {

    private final CookieBearerTokenResolver resolver = new CookieBearerTokenResolver();

    @Test
    void missingOrUnrelatedCookiesAreNotAuthentication() {
        var request = new MockHttpServletRequest("GET", "/api/v1/products");
        assertNull(resolver.resolve(request));
        request.setCookies(new Cookie("qa-unrelated", UUID.randomUUID().toString()));
        assertNull(resolver.resolve(request));
    }

    @Test
    void aSingleAccessCookieIsReturnedForDecoderValidation() {
        var opaque = UUID.randomUUID().toString();
        var request = new MockHttpServletRequest("GET", "/api/v1/products");
        request.setCookies(new Cookie(CookieBearerTokenResolver.COOKIE_NAME, opaque));
        // A boolean assertion cannot include opaque cookie values in failure output.
        assertTrue(Objects.equals(opaque, resolver.resolve(request)), "Access cookie must be delegated unchanged");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void duplicateAccessCookiesAreRejectedEvenWithAnEmptyFirstValue(boolean emptyFirst) {
        var request = new MockHttpServletRequest("GET", "/api/v1/products");
        request.setCookies(new Cookie(CookieBearerTokenResolver.COOKIE_NAME,
                        emptyFirst ? "" : UUID.randomUUID().toString()),
                new Cookie(CookieBearerTokenResolver.COOKIE_NAME, UUID.randomUUID().toString()));
        assertThrows(InvalidBearerTokenException.class, () -> resolver.resolve(request));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/auth/login", "/api/v1/auth/csrf"})
    void recoveryEndpointsIgnoreStaleAndDuplicateAccessCookiesWithinAContextPath(String path) {
        var request = new MockHttpServletRequest("POST", "/qa" + path);
        request.setContextPath("/qa");
        request.setCookies(new Cookie(CookieBearerTokenResolver.COOKIE_NAME, UUID.randomUUID().toString()),
                new Cookie(CookieBearerTokenResolver.COOKIE_NAME, UUID.randomUUID().toString()));
        assertNull(resolver.resolve(request));
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "HEAD", "TRACE", "OPTIONS"})
    void safeMethodsDoNotRequireCsrfMaterial(String method) throws Exception {
        assertCsrfOutcome(method, "missing-both", true);
    }

    static Stream<Arguments> rejectedCsrfCases() {
        return Stream.of("POST", "PUT", "DELETE").flatMap(method ->
                Stream.of("missing-both", "missing-cookie", "missing-header", "wrong-header",
                        "duplicate", "duplicate-empty-first", "empty-cookie",
                        "empty-both", "spaces-both", "tabs-both", "unicode-both")
                        .map(variant -> Arguments.of(method, variant)));
    }

    @ParameterizedTest
    @MethodSource("rejectedCsrfCases")
    void unsafeRequestsRejectMissingMismatchedEmptyOrDuplicateCsrfMaterial(String method, String variant)
            throws Exception {
        assertCsrfOutcome(method, variant, false);
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT", "DELETE"})
    void unsafeRequestsWithMatchingMaterialReachTheNextFilter(String method) throws Exception {
        assertCsrfOutcome(method, "matching", true);
    }

    private void assertCsrfOutcome(String method, String variant, boolean allowed) throws Exception {
        var material = UUID.randomUUID().toString();
        String cookieValue = switch (variant) {
            case "empty-cookie", "empty-both" -> "";
            case "spaces-both" -> "   ";
            case "tabs-both" -> " \t ";
            case "unicode-both" -> "\u2003";
            default -> material;
        };
        String headerValue = switch (variant) {
            case "empty-both" -> "";
            case "spaces-both" -> "   ";
            case "tabs-both" -> " \t ";
            case "unicode-both" -> "\u2003";
            case "wrong-header" -> UUID.randomUUID().toString();
            default -> material;
        };
        var request = new MockHttpServletRequest(method, "/api/v1/products/qa-id");
        if (!variant.equals("missing-both") && !variant.equals("missing-cookie")) {
            if (variant.equals("duplicate") || variant.equals("duplicate-empty-first")) {
                request.setCookies(new Cookie("XSRF-TOKEN", variant.equals("duplicate") ? material : ""),
                        new Cookie("XSRF-TOKEN", material));
            } else {
                request.setCookies(new Cookie("XSRF-TOKEN", cookieValue));
            }
        }
        if (!variant.equals("missing-both") && !variant.equals("missing-header")) {
            request.addHeader("X-XSRF-TOKEN", headerValue);
        }
        var response = new MockHttpServletResponse();
        var denied = new AtomicInteger();
        var forwarded = new AtomicInteger();
        var filter = new CookieCsrfHeaderFilter((ignoredRequest, deniedResponse, ignoredFailure) -> {
            denied.incrementAndGet();
            deniedResponse.setStatus(403);
        });
        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> forwarded.incrementAndGet());
        assertEquals(allowed ? 1 : 0, forwarded.get());
        assertEquals(allowed ? 0 : 1, denied.get());
        assertEquals(allowed ? 200 : 403, response.getStatus());
    }
}
