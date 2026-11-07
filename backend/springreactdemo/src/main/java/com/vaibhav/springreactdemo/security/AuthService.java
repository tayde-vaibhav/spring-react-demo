package com.vaibhav.springreactdemo.security;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public final class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtEncoder jwtEncoder;
    private final LoginRateLimiter rateLimiter;
    private final long expirySeconds;

    public AuthService(AuthenticationManager authenticationManager, JwtEncoder jwtEncoder,
            LoginRateLimiter rateLimiter,
            @Value("${app.security.jwt.expiry-seconds:900}") long expirySeconds) {
        if (expirySeconds < 60 || expirySeconds > 86_400) {
            throw new IllegalStateException("JWT_EXPIRY_SECONDS must be between 60 and 86400");
        }
        this.authenticationManager = authenticationManager;
        this.jwtEncoder = jwtEncoder;
        this.rateLimiter = rateLimiter;
        this.expirySeconds = expirySeconds;
    }

    public LoginResult login(LoginRequest request, String clientKey) {
        rateLimiter.checkAllowed(clientKey);
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(request.username(), request.password()));
        } catch (AuthenticationException exception) {
            throw new InvalidCredentialsException();
        }

        Instant issuedAt = Instant.now();
        List<String> roles = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith("ROLE_"))
                .map(authority -> authority.substring(5))
                .toList();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("spring-react-demo")
                .subject(authentication.getName())
                .id(UUID.randomUUID().toString())
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plusSeconds(expirySeconds))
                .claim("roles", roles)
                .build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new LoginResult(token, new AuthUserResponse(authentication.getName(), roles));
    }

    public record LoginResult(String token, AuthUserResponse user) {
    }
}
