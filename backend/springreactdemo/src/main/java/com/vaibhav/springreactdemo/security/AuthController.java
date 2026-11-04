package com.vaibhav.springreactdemo.security;

import java.time.Duration;
import java.util.List;

import jakarta.validation.Valid;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final Environment environment;
    private final long expirySeconds;

    public AuthController(AuthService authService, Environment environment,
            @org.springframework.beans.factory.annotation.Value("${app.security.jwt.expiry-seconds:900}")
            long expirySeconds) {
        this.authService = authService;
        this.environment = environment;
        this.expirySeconds = expirySeconds;
    }

    @GetMapping("/csrf")
    public CsrfTokenResponse csrf(CsrfToken csrfToken) {
        return new CsrfTokenResponse(csrfToken.getToken());
    }

    @PostMapping("/login")
    public ResponseEntity<AuthUserResponse> login(@Valid @RequestBody LoginRequest request,
            jakarta.servlet.http.HttpServletRequest servletRequest) {
        AuthService.LoginResult login = authService.login(request, servletRequest.getRemoteAddr());
        ResponseCookie cookie = ResponseCookie.from(CookieBearerTokenResolver.COOKIE_NAME, login.token())
                .httpOnly(true)
                .secure(secureCookie())
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofSeconds(expirySeconds))
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(login.user());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        ResponseCookie cookie = ResponseCookie.from(CookieBearerTokenResolver.COOKIE_NAME, "")
                .httpOnly(true)
                .secure(secureCookie())
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie.toString()).build();
    }

    @GetMapping("/me")
    public AuthUserResponse me(@AuthenticationPrincipal Jwt jwt) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        return new AuthUserResponse(jwt.getSubject(), roles == null ? List.of() : roles);
    }

    private boolean secureCookie() {
        return !environment.acceptsProfiles(Profiles.of("dev"));
    }
}
