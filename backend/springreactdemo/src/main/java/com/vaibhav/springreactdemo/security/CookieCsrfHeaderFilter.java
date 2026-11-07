package com.vaibhav.springreactdemo.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.filter.OncePerRequestFilter;

/** Enforces the SPA double-submit cookie/header contract for state-changing requests. */
final class CookieCsrfHeaderFilter extends OncePerRequestFilter {

    private static final String CSRF_COOKIE = "XSRF-TOKEN";
    private static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "TRACE", "OPTIONS");

    private final AccessDeniedHandler accessDeniedHandler;

    CookieCsrfHeaderFilter(AccessDeniedHandler accessDeniedHandler) {
        this.accessDeniedHandler = accessDeniedHandler;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (SAFE_METHODS.contains(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String cookieToken = csrfCookieValue(request);
        String headerToken = request.getHeader(CSRF_HEADER);
        // Cookie-bearer requests are exempted by the resource-server CSRF matcher.
        // This guard must reject blank pairs itself, not merely compare them as equal.
        if (cookieToken == null || cookieToken.isBlank() || headerToken == null || headerToken.isBlank()
                || !MessageDigest.isEqual(
                cookieToken.getBytes(StandardCharsets.UTF_8), headerToken.getBytes(StandardCharsets.UTF_8))) {
            accessDeniedHandler.handle(request, response, new AccessDeniedException("CSRF validation failed"));
            return;
        }

        chain.doFilter(request, response);
    }

    private String csrfCookieValue(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        String token = null;
        for (Cookie cookie : cookies) {
            if (CSRF_COOKIE.equals(cookie.getName())) {
                if (token != null) {
                    return null;
                }
                token = cookie.getValue();
            }
        }
        return token;
    }
}
