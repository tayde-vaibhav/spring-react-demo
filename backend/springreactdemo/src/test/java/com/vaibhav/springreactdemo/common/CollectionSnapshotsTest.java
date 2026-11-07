package com.vaibhav.springreactdemo.common;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.vaibhav.springreactdemo.product.validation.SpecsValidator;

class CollectionSnapshotsTest {

    @Test
    void preservesNullCollectionsAndElementsWithoutSharingContainers() {
        assertNull(CollectionSnapshots.list(null));
        assertNull(CollectionSnapshots.set(null));
        assertNull(CollectionSnapshots.specs(null));
        List<String> original = new ArrayList<>();
        original.add(null);
        List<String> copy = CollectionSnapshots.list(original);
        original.add("later");
        assertEquals(1, copy.size());
        assertNull(copy.getFirst());
        assertThrows(UnsupportedOperationException.class, () -> copy.add("changed"));

        var roles = new LinkedHashSet<String>();
        roles.add(null);
        var roleCopy = CollectionSnapshots.set(roles);
        roles.add("ADMIN");
        assertEquals(1, roleCopy.size());
        assertTrue(roleCopy.contains(null));
        assertThrows(UnsupportedOperationException.class, roleCopy::clear);
    }

    @Test
    void deeplyCopiesNestedMapsAndListsIncludingNullsAndNumericTypes() {
        var dimension = new LinkedHashMap<String, Object>();
        dimension.put("width", new BigDecimal("12.345"));
        dimension.put("optional", null);
        List<Object> dimensions = new ArrayList<>();
        dimensions.add(dimension);
        dimensions.add(null);
        var original = new LinkedHashMap<String, Object>();
        original.put("dimensions", dimensions);
        original.put("stock", 2L);
        Map<String, Object> copy = CollectionSnapshots.specs(original);
        dimension.put("width", BigDecimal.ZERO);
        dimensions.clear();
        original.clear();

        List<?> copiedDimensions = (List<?>) copy.get("dimensions");
        Map<?, ?> copiedDimension = (Map<?, ?>) copiedDimensions.getFirst();
        assertEquals(new BigDecimal("12.345"), copiedDimension.get("width"));
        assertNull(copiedDimension.get("optional"));
        assertTrue(copiedDimension.containsKey("optional"));
        assertNull(copiedDimensions.get(1));
        assertInstanceOf(Long.class, copy.get("stock"));
        assertThrows(UnsupportedOperationException.class, copy::clear);
        assertThrows(UnsupportedOperationException.class, copiedDimensions::clear);
        assertThrows(UnsupportedOperationException.class, copiedDimension::clear);
    }

    @Test
    void leavesOrdinaryInvalidInputsForTheExistingValidator() {
        Map<String, Object> tooDeep = Map.of("a", Map.of("b", Map.of("c", Map.of("d", true))));
        Map<String, Object> unsupported = Map.of("unsupported", new Object());
        Map<String, Object> invalidKey = Map.of("$where", "not executable");
        var validator = new SpecsValidator();
        for (var input : List.of(tooDeep, unsupported, invalidKey)) {
            var copy = assertDoesNotThrow(() -> CollectionSnapshots.specs(input));
            assertFalse(validator.isValid(copy, null));
        }
    }

    @Test
    void rejectsMapAndListCyclesWithoutUnboundedRecursion() {
        Map<String, Object> mapCycle = new LinkedHashMap<>();
        mapCycle.put("self", mapCycle);
        assertThrows(IllegalArgumentException.class, () -> CollectionSnapshots.specs(mapCycle));

        List<Object> listCycle = new ArrayList<>();
        listCycle.add(listCycle);
        assertThrows(IllegalArgumentException.class,
                () -> CollectionSnapshots.specs(Map.of("items", listCycle)));
    }

    @Test
    void acceptsSharedSubtreesWithoutTreatingThemAsCycles() {
        Map<String, Object> shared = new LinkedHashMap<>(Map.of("value", 2));
        var copy = CollectionSnapshots.specs(Map.of("first", shared, "second", shared));
        shared.clear();
        assertEquals(Map.of("value", 2), copy.get("first"));
        assertEquals(copy.get("first"), copy.get("second"));
    }

    @Test
    void boundsPathologicalDepthAndTotalNodeCount() {
        Map<String, Object> deep = Map.of("leaf", true);
        for (int depth = 0; depth < 70; depth++) {
            deep = Map.of("nested", deep);
        }
        Map<String, Object> excessiveDepth = deep;
        assertThrows(IllegalArgumentException.class, () -> CollectionSnapshots.specs(excessiveDepth));
        var oversized = Map.<String, Object>of("items", Collections.nCopies(100_001, null));
        assertThrows(IllegalArgumentException.class, () -> CollectionSnapshots.specs(oversized));
    }

    @Test
    void snapshotBudgetAccommodatesTheLargestValidListTree() {
        var input = new LinkedHashMap<String, Object>();
        for (int index = 0; index < 30; index++) {
            input.put("key" + index, Collections.nCopies(50, Collections.nCopies(50, null)));
        }
        var snapshot = assertDoesNotThrow(() -> CollectionSnapshots.specs(input));
        assertTrue(new SpecsValidator().isValid(snapshot, null));
    }
}
