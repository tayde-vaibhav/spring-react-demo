package com.vaibhav.springreactdemo.common;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Owns collection containers without replacing request validation or rejecting null elements. */
public final class CollectionSnapshots {

    // Above the largest valid specs tree (30 entries, lists of 50, validator depth 3).
    private static final int MAX_NODES = 100_000;
    private static final int MAX_DEPTH = 64;

    private CollectionSnapshots() {
    }

    public static <T> List<T> list(List<T> source) {
        return source == null ? null : Collections.unmodifiableList(new ArrayList<>(source));
    }

    public static <T> Set<T> set(Set<T> source) {
        return source == null ? null : Collections.unmodifiableSet(new LinkedHashSet<>(source));
    }

    public static Map<String, Object> specs(Map<String, Object> source) {
        return source == null ? null : copyMap(source, new CopyState(), 0);
    }

    private static <K> Map<K, Object> copyMap(Map<K, ?> source, CopyState state, int depth) {
        state.enter(source, depth);
        try {
            Map<K, Object> copy = new LinkedHashMap<>();
            source.forEach((key, value) -> copy.put(key, copyValue(value, state, depth + 1)));
            return Collections.unmodifiableMap(copy);
        } finally {
            state.path.remove(source);
        }
    }

    private static List<Object> copyList(List<?> source, CopyState state, int depth) {
        state.enter(source, depth);
        try {
            List<Object> copy = new ArrayList<>();
            for (Object value : source) {
                copy.add(copyValue(value, state, depth + 1));
            }
            return Collections.unmodifiableList(copy);
        } finally {
            state.path.remove(source);
        }
    }

    private static Object copyValue(Object value, CopyState state, int depth) {
        if (value instanceof Map<?, ?> map) {
            return copyMap(map, state, depth);
        }
        if (value instanceof List<?> list) {
            return copyList(list, state, depth);
        }
        state.visit(depth);
        // JSON scalar types are immutable. Unsupported values remain for SpecsValidator to reject.
        return value;
    }

    private static final class CopyState {
        private final Set<Object> path = Collections.newSetFromMap(new IdentityHashMap<>());
        private int nodes;

        private void visit(int depth) {
            if (++nodes > MAX_NODES || depth > MAX_DEPTH) {
                throw new IllegalArgumentException("Specifications exceed snapshot safety limits");
            }
        }

        private void enter(Object container, int depth) {
            visit(depth);
            if (!path.add(container)) {
                throw new IllegalArgumentException("Specifications must not contain cycles");
            }
        }
    }
}
