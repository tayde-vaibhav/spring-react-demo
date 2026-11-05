package com.vaibhav.springreactdemo.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 5;
    private static final int MAX_CLIENTS = 10_000;
    private final Duration window;
    private final Clock clock;
    private final Map<String, Deque<Instant>> attemptsByClient = new ConcurrentHashMap<>();

    @Autowired
    public LoginRateLimiter(
            @Value("${app.security.login-rate-limiter.window:15m}") Duration window) {
        this(window, Clock.systemUTC());
    }

    LoginRateLimiter(Duration window, Clock clock) {
        this.window = Objects.requireNonNull(window, "window must not be null");
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
        if (window.isZero() || window.isNegative()) {
            throw new IllegalArgumentException("Login rate-limit window must be positive");
        }
    }

    public void checkAllowed(String clientKey) {
        Instant now = clock.instant();
        Deque<Instant> failures = attemptsByClient.get(clientKey);
        if (failures == null) {
            if (attemptsByClient.size() >= MAX_CLIENTS) {
                removeExpiredClients();
            }
            if (attemptsByClient.size() >= MAX_CLIENTS) {
                throw new LoginRateLimitException();
            }
            Deque<Instant> freshWindow = new ArrayDeque<>();
            Deque<Instant> existing = attemptsByClient.putIfAbsent(clientKey, freshWindow);
            failures = existing == null ? freshWindow : existing;
        }
        synchronized (failures) {
            prune(failures, now);
            if (failures.size() >= MAX_ATTEMPTS) {
                throw new LoginRateLimitException();
            }
            failures.addLast(now);
        }
    }

    private void removeExpiredClients() {
        Instant cutoff = clock.instant().minus(window);
        attemptsByClient.entrySet().removeIf(entry -> {
            Deque<Instant> failures = entry.getValue();
            synchronized (failures) {
                while (!failures.isEmpty() && failures.peekFirst().isBefore(cutoff)) {
                    failures.removeFirst();
                }
                return failures.isEmpty();
            }
        });
    }

    private void prune(Deque<Instant> failures, Instant now) {
        Instant cutoff = now.minus(window);
        while (!failures.isEmpty() && failures.peekFirst().isBefore(cutoff)) {
            failures.removeFirst();
        }
    }
}
