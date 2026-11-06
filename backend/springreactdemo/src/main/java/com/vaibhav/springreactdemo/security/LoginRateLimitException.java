package com.vaibhav.springreactdemo.security;

public class LoginRateLimitException extends RuntimeException {

    public LoginRateLimitException() {
        super("Too many login attempts");
    }
}
