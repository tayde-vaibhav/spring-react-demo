package com.vaibhav.springreactdemo.security;

import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class LoginRateLimiterTest {

    @Test
    void blocksTheSixthAttemptFromTheSameClientWithinTheWindow() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int attempt = 0; attempt < 5; attempt++) {
            limiter.checkAllowed("192.0.2.10");
        }

        assertThrows(LoginRateLimitException.class, () -> limiter.checkAllowed("192.0.2.10"));
    }
}
