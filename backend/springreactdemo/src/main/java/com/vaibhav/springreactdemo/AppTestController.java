package com.vaibhav.springreactdemo;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AppTestController {

    private static final DateTimeFormatter DATE_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @GetMapping("/app-test")
    public String appTest() {
        String dateTime = LocalDateTime.now().format(DATE_TIME_FORMATTER);
        return "Hello Vaibhav! How are you? - " + dateTime;
    }
}
