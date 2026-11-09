import org.tanuki.stories.OriginPolicy;
public class OriginPolicyTest {
    static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args){
        check("https://stories.example".equals(OriginPolicy.server("https://STORIES.example:443/")),"canonical origin");
        for(String s:new String[]{"http://stories.example","javascript:alert(1)","https://user:pass@stories.example","https://stories.example/path","https://stories.example?key=secret","https://stories.example#token","https://stories.example:0","https://stories.example:65536","https://stories.example\\@evil.example","https://"})check(OriginPolicy.server(s)==null,"reject "+s);
        check(OriginPolicy.allows("https://stories.example","https://stories.example/api/auth/me"),"same origin API");
        for(String s:new String[]{"https://stories.example.evil.example","https://evil.example/stories.example","http://stories.example","https://stories.example:8443","https://stories.example@evil.example","file:///etc/passwd","intent://stories.example"})check(!OriginPolicy.allows("https://stories.example",s),"block "+s);
        System.out.println("19 origin-policy assertions passed");
    }
}
