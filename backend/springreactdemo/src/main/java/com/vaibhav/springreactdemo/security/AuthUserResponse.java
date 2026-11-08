package com.vaibhav.springreactdemo.security;

import java.util.List;

import com.vaibhav.springreactdemo.common.CollectionSnapshots;

public record AuthUserResponse(String username, List<String> roles) {

    public AuthUserResponse {
        roles = CollectionSnapshots.list(roles);
    }

    @Override
    public List<String> roles() {
        return CollectionSnapshots.list(roles);
    }
}
