package com.vaibhav.springreactdemo.security;

import java.util.Set;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.vaibhav.springreactdemo.user.User;
import com.vaibhav.springreactdemo.user.UserRepository;

@Component
@Profile("dev")
public class DevUserSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminPassword;
    private final String userPassword;

    public DevUserSeeder(UserRepository userRepository, PasswordEncoder passwordEncoder,
            @org.springframework.beans.factory.annotation.Value("${app.security.dev-users.admin-password}")
            String adminPassword,
            @org.springframework.beans.factory.annotation.Value("${app.security.dev-users.user-password}")
            String userPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminPassword = adminPassword;
        this.userPassword = userPassword;
    }

    @Override
    public void run(String... args) {
        if (adminPassword == null || adminPassword.length() < 12
                || userPassword == null || userPassword.length() < 12) {
            throw new IllegalStateException("Development user passwords must be provided and at least 12 characters long");
        }
        seedIfAbsent("admin", adminPassword, "ADMIN");
        seedIfAbsent("user", userPassword, "USER");
    }

    private void seedIfAbsent(String username, String password, String role) {
        if (!userRepository.existsByUsername(username)) {
            userRepository.save(new User(username, passwordEncoder.encode(password), Set.of(role)));
        }
    }
}
