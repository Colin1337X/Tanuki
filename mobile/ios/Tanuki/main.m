#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import "OriginPolicy.h"

@interface WorkspaceController : UIViewController <WKNavigationDelegate>
@property(nonatomic,strong) WKWebView *web;
@property(nonatomic,strong) UITextField *address;
@property(nonatomic,strong) UILabel *status;
@property(nonatomic,copy) NSString *server;
@end
@implementation WorkspaceController
- (void)viewDidLoad {[super viewDidLoad];[self setup];}
- (void)setup {
    [self.web stopLoading];self.web.navigationDelegate=nil;self.web=nil;self.server=nil;
    for(UIView *view in self.view.subviews)[view removeFromSuperview];
    self.view.backgroundColor=[UIColor colorWithRed:0.98 green:0.97 blue:0.94 alpha:1];
    UIStackView *stack=[[UIStackView alloc]init];stack.axis=UILayoutConstraintAxisVertical;stack.spacing=20;stack.translatesAutoresizingMaskIntoConstraints=NO;[self.view addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[[stack.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:36],[stack.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:24],[stack.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-24]]];
    UILabel *title=[[UILabel alloc]init];title.text=@"Tanuki Stories";title.font=[UIFont preferredFontForTextStyle:UIFontTextStyleLargeTitle];title.adjustsFontForContentSizeCategory=YES;[stack addArrangedSubview:title];
    UILabel *label=[[UILabel alloc]init];label.text=@"Your Tanuki Server HTTPS address";label.numberOfLines=0;[stack addArrangedSubview:label];
    self.address=[[UITextField alloc]init];self.address.placeholder=@"https://stories.example.org";self.address.accessibilityLabel=label.text;self.address.keyboardType=UIKeyboardTypeURL;self.address.autocapitalizationType=UITextAutocapitalizationTypeNone;self.address.autocorrectionType=UITextAutocorrectionTypeNo;self.address.borderStyle=UITextBorderStyleRoundedRect;self.address.text=[[NSUserDefaults standardUserDefaults]stringForKey:@"server"];[stack addArrangedSubview:self.address];
    UIButton *connect=[UIButton buttonWithType:UIButtonTypeSystem];[connect setTitle:@"Open my workspace" forState:UIControlStateNormal];[connect addTarget:self action:@selector(connect) forControlEvents:UIControlEventTouchUpInside];[stack addArrangedSubview:connect];
    self.status=[[UILabel alloc]init];self.status.numberOfLines=0;[stack addArrangedSubview:self.status];
}
- (void)connect {
    NSString *approved=TanukiServer([self.address.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet]);
    if(!approved){self.status.text=@"Enter an HTTPS origin without a path or credentials.";return;}
    self.server=approved;[[NSUserDefaults standardUserDefaults]setObject:approved forKey:@"server"];
    for(UIView *view in self.view.subviews)[view removeFromSuperview];
    UIButton *close=[UIButton buttonWithType:UIButtonTypeSystem];[close setTitle:@"Close workspace / change server" forState:UIControlStateNormal];[close addTarget:self action:@selector(setup) forControlEvents:UIControlEventTouchUpInside];close.translatesAutoresizingMaskIntoConstraints=NO;[self.view addSubview:close];
    WKWebViewConfiguration *config=[[WKWebViewConfiguration alloc]init];config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
    self.web=[[WKWebView alloc]initWithFrame:CGRectZero configuration:config];self.web.navigationDelegate=self;self.web.translatesAutoresizingMaskIntoConstraints=NO;[self.view addSubview:self.web];
    [NSLayoutConstraint activateConstraints:@[[close.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],[close.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:16],[self.web.topAnchor constraintEqualToAnchor:close.bottomAnchor constant:8],[self.web.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor],[self.web.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],[self.web.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor]]];
    [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[approved stringByAppendingString:@"/"]] cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:30]];
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {
    handler(TanukiAllows(self.server,action.request.URL)?WKNavigationActionPolicyAllow:WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationResponse:(WKNavigationResponse *)response decisionHandler:(void (^)(WKNavigationResponsePolicy))handler {
    handler(TanukiAllows(self.server,response.response.URL)?WKNavigationResponsePolicyAllow:WKNavigationResponsePolicyCancel);
}
- (void)webView:(WKWebView *)web didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self setup];self.status.text=@"Unable to connect securely. Check the server address, TLS certificate and network.";
}
@end
@interface AppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation AppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    self.window=[[UIWindow alloc]initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=[[WorkspaceController alloc]init];[self.window makeKeyAndVisible];return YES;
}
@end
int main(int argc,char *argv[]){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(AppDelegate.class));}}
