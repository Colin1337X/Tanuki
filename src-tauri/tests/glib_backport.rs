#![cfg(target_os = "linux")]
use glib::variant::ToVariant;

#[test]
fn optimized_string_iterator_preserves_all_traversal_directions() {
    let value = ["alpha", "beta", "gamma", "delta", "epsilon"].to_variant();
    let mut iter = value.array_iter_str().unwrap();
    assert_eq!(iter.next(), Some("alpha"));
    assert_eq!(iter.next_back(), Some("epsilon"));
    assert_eq!(iter.nth(1), Some("gamma"));
    assert_eq!(iter.last(), Some("delta"));
    assert_eq!(value.array_iter_str().unwrap().nth_back(2), Some("gamma"));
    assert_eq!(value.array_iter_str().unwrap().collect::<Vec<_>>(), vec!["alpha", "beta", "gamma", "delta", "epsilon"]);
}
