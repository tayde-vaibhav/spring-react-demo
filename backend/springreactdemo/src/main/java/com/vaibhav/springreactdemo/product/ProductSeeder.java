package com.vaibhav.springreactdemo.product;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

import net.datafaker.Faker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.data.mongodb.core.MongoTemplate;

@Component
@Profile("dev")
public class ProductSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ProductSeeder.class);
    private static final long RANDOM_SEED = 20261104L;
    private static final int BATCH_SIZE = 100;
    private static final List<Category> CATEGORIES = List.of(
            new Category("Electronics", "electronics"),
            new Category("Clothing", "clothing"),
            new Category("Home & Kitchen", "home"),
            new Category("Books", "books"),
            new Category("Sports & Outdoors", "sports"),
            new Category("Beauty & Personal Care", "beauty"),
            new Category("Toys & Games", "toys"),
            new Category("Grocery", "grocery"),
            new Category("Office Supplies", "office"));

    private static final Map<String, List<String>> CATEGORY_TAGS = Map.of(
            "Electronics", List.of("wireless", "smart", "portable", "electronics", "accessories"),
            "Clothing", List.of("casual", "fashion", "cotton", "everyday", "apparel"),
            "Home & Kitchen", List.of("home", "kitchen", "durable", "modern", "essentials"),
            "Books", List.of("reading", "bestseller", "fiction", "learning", "paperback"),
            "Sports & Outdoors", List.of("fitness", "outdoor", "training", "performance", "sports"),
            "Beauty & Personal Care", List.of("beauty", "skincare", "self-care", "daily", "wellness"),
            "Toys & Games", List.of("family", "creative", "educational", "play", "kids"),
            "Grocery", List.of("pantry", "organic", "snack", "natural", "grocery"),
            "Office Supplies", List.of("office", "workspace", "stationery", "professional", "supplies"));

    private final ProductRepository productRepository;
    private final MongoTemplate mongoTemplate;
    private final int recordCount;

    public ProductSeeder(ProductRepository productRepository,
            MongoTemplate mongoTemplate,
            @Value("${app.seed.products.count:500}") int recordCount) {
        this.productRepository = productRepository;
        this.mongoTemplate = mongoTemplate;
        this.recordCount = recordCount;
    }

    @Override
    public void run(String... args) {
        if (recordCount <= 0) {
            log.info("Product seeding skipped: configured record count is {}", recordCount);
            return;
        }
        if (productRepository.count() > 0) {
            log.info("Product seeding skipped: products collection is not empty");
            return;
        }

        Faker faker = new Faker(Locale.ENGLISH, new Random(RANDOM_SEED));
        Random random = new Random(RANDOM_SEED);
        List<Product> batch = new ArrayList<>(BATCH_SIZE);
        int inserted = 0;

        for (int i = 0; i < recordCount; i++) {
            batch.add(createProduct(faker, random, CATEGORIES.get(random.nextInt(CATEGORIES.size()))));
            if (batch.size() == BATCH_SIZE || i == recordCount - 1) {
                mongoTemplate.insertAll(batch);
                inserted += batch.size();
                batch.clear();
            }
        }

        log.info("Seeded {} products across {} categories", inserted, CATEGORIES.size());
    }

    private Product createProduct(Faker faker, Random random, Category category) {
        Product product = new Product();
        product.setName(faker.commerce().productName());
        product.setDescription(faker.lorem().sentence(12));
        product.setCategory(category.name());
        product.setPrice(BigDecimal.valueOf(random.nextInt(199_501) + 500, 2));
        product.setStock(random.nextInt(501));
        product.setTags(selectTags(random, CATEGORY_TAGS.get(category.name())));
        product.setSpecs(createSpecs(faker, random, category.specType()));
        product.setActive(random.nextBoolean());
        return product;
    }

    private List<String> selectTags(Random random, List<String> availableTags) {
        List<String> shuffled = new ArrayList<>(availableTags);
        java.util.Collections.shuffle(shuffled, random);
        return List.copyOf(shuffled.subList(0, 2 + random.nextInt(4)));
    }

    private Map<String, Object> createSpecs(Faker faker, Random random, String specType) {
        return switch (specType) {
            case "electronics" -> Map.of(
                    "brand", faker.commerce().brand(),
                    "color", faker.color().name(),
                    "connectivity", random.nextBoolean() ? "Bluetooth" : "Wi-Fi",
                    "warrantyYears", 1 + random.nextInt(3));
            case "clothing" -> Map.of(
                    "size", List.of("XS", "S", "M", "L", "XL").get(random.nextInt(5)),
                    "material", faker.commerce().material(),
                    "color", faker.color().name(),
                    "fit", random.nextBoolean() ? "Regular" : "Relaxed");
            case "home" -> Map.of(
                    "material", faker.commerce().material(),
                    "color", faker.color().name(),
                    "room", List.of("Kitchen", "Living room", "Bedroom").get(random.nextInt(3)),
                    "assemblyRequired", random.nextBoolean());
            case "books" -> Map.of(
                    "author", faker.name().fullName(),
                    "format", random.nextBoolean() ? "Paperback" : "Hardcover",
                    "pages", 100 + random.nextInt(901),
                    "language", "English");
            case "sports" -> Map.of(
                    "sport", List.of("Running", "Cycling", "Fitness", "Camping").get(random.nextInt(4)),
                    "material", faker.commerce().material(),
                    "weightGrams", 100 + random.nextInt(9_901),
                    "color", faker.color().name());
            case "beauty" -> Map.of(
                    "skinType", List.of("All", "Dry", "Oily", "Sensitive").get(random.nextInt(4)),
                    "volumeMl", 30 + random.nextInt(471),
                    "formulation", List.of("Cream", "Serum", "Lotion", "Gel").get(random.nextInt(4)),
                    "crueltyFree", random.nextBoolean());
            case "toys" -> Map.of(
                    "ageRange", List.of("3+", "6+", "8+", "12+").get(random.nextInt(4)),
                    "material", faker.commerce().material(),
                    "pieces", 10 + random.nextInt(491),
                    "educational", random.nextBoolean());
            case "grocery" -> Map.of(
                    "unitSize", (1 + random.nextInt(24)) + " oz",
                    "dietary", List.of("None", "Vegan", "Gluten-free", "Organic").get(random.nextInt(4)),
                    "shelfStable", random.nextBoolean(),
                    "origin", faker.address().country());
            case "office" -> Map.of(
                    "paperSize", List.of("A4", "Letter", "Legal").get(random.nextInt(3)),
                    "color", faker.color().name(),
                    "packQuantity", 1 + random.nextInt(50),
                    "recycled", random.nextBoolean());
            default -> throw new IllegalArgumentException("Unsupported product spec type: " + specType);
        };
    }

    private record Category(String name, String specType) {
    }
}
