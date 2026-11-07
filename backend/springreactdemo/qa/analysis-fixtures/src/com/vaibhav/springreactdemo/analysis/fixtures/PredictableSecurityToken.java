package com.vaibhav.springreactdemo.analysis.fixtures;

import java.util.Random;

/** Intentionally unsafe analyzer input. Never use for authentication or execute. */
public class PredictableSecurityToken {
    public String passwordResetToken() {
        return Long.toHexString(new Random(12345L).nextLong());
    }
}
