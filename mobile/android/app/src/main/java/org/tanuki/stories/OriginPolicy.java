package org.tanuki.stories;
import java.net.URI;
import java.util.Locale;

public final class OriginPolicy {
    public static String origin(String text) {
        try {
            URI u = new URI(text);
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null || u.getRawUserInfo() != null || u.getPort() == 0 || u.getPort() > 65535) return null;
            String host = u.getHost().toLowerCase(Locale.ROOT);
            int port = u.getPort();
            return "https://" + host + (port == -1 || port == 443 ? "" : ":" + port);
        } catch (Exception e) { return null; }
    }
    public static String server(String text) {
        String o = origin(text);
        if (o == null) return null;
        URI u = URI.create(text);
        if (u.getRawQuery() != null || u.getRawFragment() != null || !(u.getRawPath().isEmpty() || u.getRawPath().equals("/"))) return null;
        return o;
    }
    public static boolean allows(String server, String destination) {
        return server != null && server.equals(origin(destination));
    }
}
