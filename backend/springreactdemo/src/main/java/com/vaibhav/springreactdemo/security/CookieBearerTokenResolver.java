package com.vaibhav.springreactdemo.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

public class CookieBearerTokenResolver implements BearerTokenResolver {

    public static final String COOKIE_NAME = "ACCESS_TOKEN";

    @Override
    public String resolve(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if ("/api/v1/auth/login".equals(path) || "/api/v1/auth/csrf".equals(path)) {
            return null;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        String found = null;
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                if (found != null) {
                    throw new InvalidBearerTokenException("Multiple access token cookies supplied");
                }
                found = cookie.getValue();
            }
        }
        return found;
    }
}
