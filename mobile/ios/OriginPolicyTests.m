#import <Foundation/Foundation.h>
#import "Tanuki/OriginPolicy.h"
static void check(BOOL value,NSString *message){if(!value){NSLog(@"FAIL: %@",message);exit(1);}}
int main(void){@autoreleasepool{
    check([TanukiServer(@"https://STORIES.example:443/") isEqualToString:@"https://stories.example"],@"canonical origin");
    for(NSString *s in @[@"http://stories.example",@"javascript:alert(1)",@"https://user:pass@stories.example",@"https://stories.example/path",@"https://stories.example?key=secret",@"https://stories.example#token",@"https://stories.example:0",@"https://stories.example:65536",@"https://"])check(TanukiServer(s)==nil,s);
    check(TanukiAllows(@"https://stories.example",[NSURL URLWithString:@"https://stories.example/api/auth/me"]),@"same origin API");
    for(NSString *s in @[@"https://stories.example.evil.example",@"https://evil.example/stories.example",@"http://stories.example",@"https://stories.example:8443",@"https://stories.example@evil.example",@"file:///etc/passwd",@"intent://stories.example"])check(!TanukiAllows(@"https://stories.example",[NSURL URLWithString:s]),s);
    puts("18 origin-policy assertions passed");return 0;
}}
