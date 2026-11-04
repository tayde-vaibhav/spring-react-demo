package com.vaibhav.springreactdemo.security;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

@Component
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 5;
    private static final int MAX_CLIENTS = 10_000;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private final Map<String, Deque<Instant>> attemptsByClient = new ConcurrentHashMap<>();

    public void checkAllowed(String clientKey) {
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
            prune(failures, Instant.now());
            if (failures.size() >= MAX_ATTEMPTS) {
                throw new LoginRateLimitException();
            }
            failures.addLast(Instant.now());
        }
    }

    private void removeExpiredClients() {
        Instant cutoff = Instant.now().minus(WINDOW);
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
        Instant cutoff = now.minus(WINDOW);
        while (!failures.isEmpty() && failures.peekFirst().isBefore(cutoff)) {
            failures.removeFirst();
        }
    }
}
