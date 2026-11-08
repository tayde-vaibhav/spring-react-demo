package com.vaibhav.springreactdemo.security;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Modifier;
import java.time.Clock;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.oauth2.jwt.JwtEncoder;

class SecurityComponentConstructionTest {

    private final AuthenticationManager manager = authentication -> authentication;
    private final JwtEncoder encoder = parameters -> {
        throw new AssertionError("Construction must not encode tokens");
    };

    @ParameterizedTest
    @ValueSource(longs = {60, 900, 86_400})
    void acceptsExistingExpiryBoundaries(long seconds) {
        assertDoesNotThrow(() -> new AuthService(manager, encoder,
                new LoginRateLimiter(Duration.ofMinutes(15)), seconds));
    }

    @ParameterizedTest
    @ValueSource(longs = {Long.MIN_VALUE, 59, 86_401, Long.MAX_VALUE})
    void rejectsOutOfRangeExpiryWithoutChangingTheFailure(long seconds) {
        var failure = assertThrows(IllegalStateException.class, () -> new AuthService(manager, encoder,
                new LoginRateLimiter(Duration.ofMinutes(15)), seconds));
        assertEquals("JWT_EXPIRY_SECONDS must be between 60 and 86400", failure.getMessage());
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    void bothLimiterConstructorsRetainPositiveWindowValidation(long seconds) {
        var duration = Duration.ofSeconds(seconds);
        var publicFailure = assertThrows(IllegalArgumentException.class, () -> new LoginRateLimiter(duration));
        var clockFailure = assertThrows(IllegalArgumentException.class,
                () -> new LoginRateLimiter(duration, Clock.systemUTC()));
        assertEquals("Login rate-limit window must be positive", publicFailure.getMessage());
        assertEquals(publicFailure.getMessage(), clockFailure.getMessage());
    }

    @Test
    void limiterRetainsNullAndMinimumPositiveWindowContracts() {
        assertEquals("window must not be null", assertThrows(NullPointerException.class,
                () -> new LoginRateLimiter(null)).getMessage());
        assertEquals("window must not be null", assertThrows(NullPointerException.class,
                () -> new LoginRateLimiter(null, Clock.systemUTC())).getMessage());
        assertEquals("clock must not be null", assertThrows(NullPointerException.class,
                () -> new LoginRateLimiter(Duration.ofMinutes(15), null)).getMessage());
        assertDoesNotThrow(() -> new LoginRateLimiter(Duration.ofNanos(1)));
        assertDoesNotThrow(() -> new LoginRateLimiter(Duration.ofNanos(1), Clock.systemUTC()));
    }

    @Test
    void throwingComponentsCannotAcquireHostileSubclassFinalizers() {
        assertTrue(Modifier.isFinal(AuthService.class.getModifiers()));
        assertTrue(Modifier.isFinal(LoginRateLimiter.class.getModifiers()));
    }
}
