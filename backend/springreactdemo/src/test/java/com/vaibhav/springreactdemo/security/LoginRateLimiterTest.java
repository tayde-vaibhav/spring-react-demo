package com.vaibhav.springreactdemo.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class LoginRateLimiterTest {

    @Test
    void blocksTheSixthAttemptFromTheSameClientWithinTheWindow() {
        LoginRateLimiter limiter = new LoginRateLimiter(Duration.ofMinutes(15),
                new MutableClock(Instant.parse("2026-01-01T00:00:00Z")));
        for (int attempt = 0; attempt < 5; attempt++) {
            limiter.checkAllowed("192.0.2.10");
        }

        assertThrows(LoginRateLimitException.class, () -> limiter.checkAllowed("192.0.2.10"));
    }

    @Test
    void expiresAttemptsAfterTheConfiguredQaWindow() {
        MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        LoginRateLimiter limiter = new LoginRateLimiter(Duration.ofMinutes(2), clock);
        for (int attempt = 0; attempt < 5; attempt++) {
            limiter.checkAllowed("192.0.2.11");
        }

        assertThrows(LoginRateLimitException.class, () -> limiter.checkAllowed("192.0.2.11"));
        clock.advance(Duration.ofMinutes(2).plusNanos(1));

        assertDoesNotThrow(() -> limiter.checkAllowed("192.0.2.11"));
    }

    @Test
    void rejectsNonPositiveWindows() {
        assertThrows(IllegalArgumentException.class,
                () -> new LoginRateLimiter(Duration.ZERO, Clock.systemUTC()));
        assertThrows(IllegalArgumentException.class,
                () -> new LoginRateLimiter(Duration.ofSeconds(-1), Clock.systemUTC()));
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(instant);
        }

        @Override
        public Instant instant() {
            return instant;
        }

        private void advance(Duration duration) {
            instant = instant.plus(duration);
        }
    }
}
