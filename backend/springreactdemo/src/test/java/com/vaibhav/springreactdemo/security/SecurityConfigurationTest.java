package com.vaibhav.springreactdemo.security;

import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class SecurityConfigurationTest {

    @Test
    void corsRejectsWildcardOriginWhenCredentialsAreEnabled() {
        SecurityConfiguration configuration = new SecurityConfiguration();

        assertThrows(IllegalStateException.class,
                () -> configuration.corsConfigurationSource(new MockEnvironment(), "*"));
    }
}
