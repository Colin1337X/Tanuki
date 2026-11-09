#import "OriginPolicy.h"
NSString *TanukiOrigin(NSURL *url) {
    if (!url || ![url.scheme.lowercaseString isEqualToString:@"https"] || !url.host.length || url.user || url.password || (url.port && (url.port.integerValue < 1 || url.port.integerValue > 65535))) return nil;
    NSString *host=url.host.lowercaseString;
    if ([host containsString:@":"] && ![host hasPrefix:@"["]) host=[NSString stringWithFormat:@"[%@]",host];
    return [NSString stringWithFormat:@"https://%@%@",host,(!url.port || url.port.integerValue==443)?@"":[NSString stringWithFormat:@":%@",url.port]];
}
NSString *TanukiServer(NSString *text) {
    NSURL *url=[NSURL URLWithString:text];
    if (url.query || url.fragment || (url.path.length && ![url.path isEqualToString:@"/"])) return nil;
    return TanukiOrigin(url);
}
BOOL TanukiAllows(NSString *origin,NSURL *url) {return origin && [origin isEqualToString:TanukiOrigin(url)];}
