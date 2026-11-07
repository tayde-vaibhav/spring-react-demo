package com.vaibhav.springreactdemo.analysis.fixtures;

import java.util.List;

/** Intentionally unsafe analyzer input. Compile/analyze only; never instantiate. */
public class MutableAlias {
    private final List<String> permissions;

    public MutableAlias(List<String> permissions) {
        this.permissions = permissions;
    }

    public List<String> permissions() {
        return permissions;
    }
}
