package com.vaibhav.springreactdemo.api;

/** Bounded single-line rendering for values already selected for logging, not request-data collection. */
final class LogSanitizer {

    static final int MAX_VALUE_LENGTH = 512;
    private static final String TRUNCATED = "...";

    private LogSanitizer() {
    }

    static String singleLine(String value) {
        if (value == null) {
            return "null";
        }
        boolean truncated = value.length() > MAX_VALUE_LENGTH;
        int limit = truncated ? MAX_VALUE_LENGTH - TRUNCATED.length() : MAX_VALUE_LENGTH;
        StringBuilder result = new StringBuilder(Math.min(value.length(), MAX_VALUE_LENGTH));
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            int type = Character.getType(codePoint);
            boolean replace = Character.isISOControl(codePoint) || type == Character.FORMAT
                    || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR
                    || type == Character.SURROGATE;
            int renderedLength = replace ? 1 : Character.charCount(codePoint);
            if (result.length() + renderedLength > limit) {
                break;
            }
            if (replace) {
                result.append('_');
            } else {
                result.appendCodePoint(codePoint);
            }
            offset += Character.charCount(codePoint);
        }
        if (truncated) {
            result.append(TRUNCATED);
        }
        return result.toString();
    }
}
