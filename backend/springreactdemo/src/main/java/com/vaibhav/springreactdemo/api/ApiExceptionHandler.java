package com.vaibhav.springreactdemo.api;

import java.net.URI;
import java.util.Map;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.vaibhav.springreactdemo.product.ProductNotFoundException;
import com.vaibhav.springreactdemo.security.InvalidCredentialsException;
import com.vaibhav.springreactdemo.security.LoginRateLimitException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Request validation failed",
                "One or more request fields are invalid.", request);
        Map<String, String> errors = exception.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        error -> error.getField(),
                        error -> error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage(),
                        (first, second) -> first));
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableBody(HttpMessageNotReadableException exception, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request body",
                "The request body is missing or is not valid JSON.", request);
    }

    @ExceptionHandler(ProductNotFoundException.class)
    public ProblemDetail handleNotFound(ProductNotFoundException exception, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, "Product not found", exception.getMessage(), request);
    }

    @ExceptionHandler({AuthenticationException.class, InvalidCredentialsException.class})
    public ProblemDetail handleUnauthorized(Exception exception, HttpServletRequest request) {
        return problem(HttpStatus.UNAUTHORIZED, "Authentication required",
                "Authentication failed or is required to access this resource.", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleForbidden(AccessDeniedException exception, HttpServletRequest request) {
        return problem(HttpStatus.FORBIDDEN, "Access denied",
                "You do not have permission to access this resource.", request);
    }

    @ExceptionHandler(LoginRateLimitException.class)
    public ProblemDetail handleRateLimit(LoginRateLimitException exception, HttpServletRequest request) {
        return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many login attempts",
                "Please wait before trying to log in again.", request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleBadRequest(IllegalArgumentException exception, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request parameters",
                exception.getMessage() == null ? "Request parameters are invalid." : exception.getMessage(), request);
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ProblemDetail handleOptimisticLock(OptimisticLockingFailureException exception,
            HttpServletRequest request) {
        return problem(HttpStatus.CONFLICT, "Concurrent update conflict",
                "The product changed while this update was being saved. Reload and retry.", request);
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception exception, HttpServletRequest request) {
        log.error("Unhandled API exception for {}", request.getRequestURI(), exception);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error",
                "An unexpected error occurred.", request);
    }

    private ProblemDetail problem(HttpStatus status, String title, String detail, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("urn:problem:" + title.toLowerCase().replace(' ', '-')));
        problem.setTitle(title);
        problem.setInstance(URI.create(request.getRequestURI()));
        return problem;
    }
}
