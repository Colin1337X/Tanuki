use url::Url;

pub fn server_origin(input: &str) -> Result<Url, &'static str> {
    if input.len() > 2048 || input.chars().any(|c| c.is_control() || c == '\\') {
        return Err("Enter a valid HTTPS server address.");
    }
    let url = Url::parse(input).map_err(|_| "Enter a valid HTTPS server address.")?;
    if url.scheme() != "https" || url.host_str().is_none() || !url.username().is_empty()
        || url.password().is_some() || url.port() == Some(0) || url.path() != "/"
        || url.query().is_some() || url.fragment().is_some()
    {
        return Err("Use an HTTPS origin without credentials, a path, query or fragment.");
    }
    Ok(url)
}

pub fn local_launcher(url: &Url) -> bool {
    matches!((url.scheme(), url.host_str()), ("tauri", Some("localhost")) | ("http", Some("tauri.localhost")))
        && url.port().is_none() && url.username().is_empty() && url.password().is_none()
}

pub fn allows(origin: &Url, target: &Url) -> bool {
    target.scheme() == "https" && target.username().is_empty() && target.password().is_none()
        && target.origin() == origin.origin()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_ambiguous_or_credential_bearing_origins() {
        for input in ["http://school.test", "https://user:pass@school.test", "https://school.test/path", "https://school.test/?token=x", "https://school.test/#x", "https://school.test:0", "https://school.test\\@evil.test", "https://school.\ntest", "file:///etc/passwd", "javascript:alert(1)"] {
            assert!(server_origin(input).is_err(), "accepted {input}");
        }
    }
    #[test]
    fn normalizes_origins_and_preserves_explicit_ports() {
        assert_eq!(server_origin("https://SCHOOL.test:443").unwrap().as_str(), "https://school.test/");
        assert_eq!(server_origin("https://school.test:8443").unwrap().port(), Some(8443));
        assert!(server_origin("https://[::1]:8443").is_ok());
    }
    #[test]
    fn navigation_is_bound_to_exact_origin() {
        let origin = server_origin("https://school.test").unwrap();
        assert!(allows(&origin, &Url::parse("https://school.test/stories?id=1").unwrap()));
        for input in ["https://school.test.evil.test/", "https://evil.test/", "http://school.test/", "https://school.test:8443/", "https://user@school.test/", "file:///etc/passwd", "tauri://localhost/"] {
            assert!(!allows(&origin, &Url::parse(input).unwrap()), "allowed {input}");
        }
    }
    #[test]
    fn remote_pages_cannot_impersonate_launcher() {
        for input in ["https://tauri.localhost/", "http://tauri.localhost.evil.test/", "http://tauri.localhost:8080/", "tauri://evil.test/", "http://user@tauri.localhost/"] {
            assert!(!local_launcher(&Url::parse(input).unwrap()));
        }
        assert!(local_launcher(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(local_launcher(&Url::parse("http://tauri.localhost/index.html").unwrap()));
    }
}
