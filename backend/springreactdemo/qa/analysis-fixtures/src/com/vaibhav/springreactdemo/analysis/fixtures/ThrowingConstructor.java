package com.vaibhav.springreactdemo.analysis.fixtures;

/** Deliberately non-final with a throwing constructor, for CT_CONSTRUCTOR_THROW. */
public class ThrowingConstructor {
    public ThrowingConstructor(boolean allowed) {
        if (!allowed) {
            throw new IllegalArgumentException("synthetic fixture rejection");
        }
    }
}
