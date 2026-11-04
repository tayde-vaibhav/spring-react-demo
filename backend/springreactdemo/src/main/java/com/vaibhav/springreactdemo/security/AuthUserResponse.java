package com.vaibhav.springreactdemo.security;

import java.util.List;

public record AuthUserResponse(String username, List<String> roles) {
}
