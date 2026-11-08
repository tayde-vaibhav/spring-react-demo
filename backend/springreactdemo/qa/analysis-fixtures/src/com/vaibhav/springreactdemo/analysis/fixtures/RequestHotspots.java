package com.vaibhav.springreactdemo.analysis.fixtures;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Unvalidated request inputs, intentionally isolated from application scanning. */
@RestController
public class RequestHotspots {
    @GetMapping("/qa-analysis-fixture-never-register")
    public String endpoint() {
        return "synthetic fixture";
    }

    public String cookieValue(Cookie cookie) {
        return cookie.getValue();
    }

    public String header(HttpServletRequest request) {
        return request.getHeader("X-QA-Synthetic");
    }

    public String parameter(HttpServletRequest request) {
        return request.getParameter("qa-synthetic");
    }
}
