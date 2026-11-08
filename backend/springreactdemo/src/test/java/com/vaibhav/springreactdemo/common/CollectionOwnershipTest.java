package com.vaibhav.springreactdemo.common;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.vaibhav.springreactdemo.product.Product;
import com.vaibhav.springreactdemo.product.dto.ProductPageResponse;
import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;
import com.vaibhav.springreactdemo.product.dto.ProductUpdateRequest;
import com.vaibhav.springreactdemo.security.AuthUserResponse;
import com.vaibhav.springreactdemo.user.User;

class CollectionOwnershipTest {

    @Test
    void productOwnsInputAndExposedCollectionsIncludingNestedSpecs() {
        var tags = new ArrayList<>(List.of("original"));
        var nested = new LinkedHashMap<String, Object>(Map.of("width", 3));
        var specs = new LinkedHashMap<String, Object>(Map.of("dimensions", nested));
        var product = new Product();
        product.setTags(tags);
        product.setSpecs(specs);
        tags.clear();
        nested.clear();
        specs.clear();
        assertCollections(product.getTags(), product.getSpecs());
        assertThrows(UnsupportedOperationException.class, () -> product.getTags().clear());
        assertThrows(UnsupportedOperationException.class, () -> product.getSpecs().clear());
        assertThrows(UnsupportedOperationException.class,
                () -> ((Map<?, ?>) product.getSpecs().get("dimensions")).clear());
        assertCollections(product.getTags(), product.getSpecs());
    }

    @Test
    void requestOwnsCollectionsWhileKeepingNullElementsForValidation() {
        var tags = new ArrayList<>(List.of("original"));
        var nested = new LinkedHashMap<String, Object>(Map.of("width", 3));
        var request = new ProductRequest("Name", null, "Category", BigDecimal.ONE, 0,
                tags, Map.of("dimensions", nested), true);
        tags.clear();
        nested.clear();
        assertCollections(request.tags(), request.specs());
        assertThrows(UnsupportedOperationException.class, () -> request.tags().clear());
        assertThrows(UnsupportedOperationException.class, () -> request.specs().clear());

        var invalidTags = new ArrayList<String>();
        invalidTags.add(null);
        assertNull(new ProductRequest("Name", null, "Category", BigDecimal.ONE, 0,
                invalidTags, null, true).tags().getFirst());
    }

    @Test
    void updateOwnsCollectionsWithoutChangingVersion() {
        var tags = new ArrayList<>(List.of("original"));
        var nested = new LinkedHashMap<String, Object>(Map.of("width", 3));
        var update = new ProductUpdateRequest("Name", null, "Category", BigDecimal.ONE, 0,
                tags, Map.of("dimensions", nested), true, 7L);
        tags.clear();
        nested.clear();
        assertEquals(7L, update.version());
        assertCollections(update.tags(), update.specs());
        assertThrows(UnsupportedOperationException.class, () -> update.tags().clear());
        assertThrows(UnsupportedOperationException.class, () -> update.specs().clear());
    }

    @Test
    void responseAndPageOwnCollections() {
        var tags = new ArrayList<>(List.of("original"));
        var nested = new LinkedHashMap<String, Object>(Map.of("width", 3));
        var response = new ProductResponse("server-id", "Name", null, "Category", BigDecimal.ONE,
                0, tags, Map.of("dimensions", nested), true, null, null, 7L);
        var content = new ArrayList<>(List.of(response));
        var page = new ProductPageResponse(content, 0, 20, 1, 1, true, true);
        tags.clear();
        nested.clear();
        content.clear();
        assertEquals(1, page.content().size());
        assertCollections(response.tags(), response.specs());
        assertThrows(UnsupportedOperationException.class, () -> page.content().clear());
        assertThrows(UnsupportedOperationException.class, () -> response.tags().clear());
        assertThrows(UnsupportedOperationException.class, () -> response.specs().clear());
    }

    @Test
    void userAndAuthResponseOwnRoleCollections() {
        Set<String> roles = new LinkedHashSet<>(Set.of("USER"));
        var user = new User("qa-user", "unused-test-hash", roles);
        roles.add("ADMIN");
        assertEquals(Set.of("USER"), user.getRoles());
        assertThrows(UnsupportedOperationException.class, () -> user.getRoles().add("ADMIN"));

        var responseRoles = new ArrayList<>(List.of("USER"));
        var response = new AuthUserResponse("qa-user", responseRoles);
        responseRoles.add("ADMIN");
        assertEquals(List.of("USER"), response.roles());
        assertThrows(UnsupportedOperationException.class, () -> response.roles().add("ADMIN"));
    }

    @Test
    void preservesOptionalNullCollectionsAcrossEntitiesAndRecords() {
        var product = new Product();
        product.setTags(null);
        product.setSpecs(null);
        assertNull(product.getTags());
        assertNull(product.getSpecs());
        assertNull(new User().getRoles());
        assertNull(new User("qa-user", "unused-test-hash", null).getRoles());
        var request = new ProductRequest("Name", null, "Category", BigDecimal.ONE, 0, null, null, true);
        var update = new ProductUpdateRequest("Name", null, "Category", BigDecimal.ONE, 0, null, null, true, 0L);
        var response = new ProductResponse("id", "Name", null, "Category", BigDecimal.ONE, 0,
                null, null, true, null, null, 0L);
        assertNull(request.tags());
        assertNull(request.specs());
        assertNull(update.tags());
        assertNull(update.specs());
        assertNull(response.tags());
        assertNull(response.specs());
        assertNull(new ProductPageResponse(null, 0, 20, 0, 0, true, true).content());
        assertNull(new AuthUserResponse("qa-user", null).roles());
    }

    private static void assertCollections(List<String> tags, Map<String, Object> specs) {
        assertEquals(List.of("original"), tags);
        assertEquals(Map.of("dimensions", Map.of("width", 3)), specs);
    }
}
