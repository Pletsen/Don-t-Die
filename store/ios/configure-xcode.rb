# The few Xcode build settings DUCKWISE changes on the App target, done with
# the xcodeproj gem (it comes with CocoaPods) instead of by hand in Xcode.
#   ruby store/ios/configure-xcode.rb ios/App/App.xcodeproj
require 'xcodeproj'

project = Xcodeproj::Project.open(ARGV[0] || 'ios/App/App.xcodeproj')
target = project.targets.find { |t| t.name == 'App' } or abort('No App target')

target.build_configurations.each do |config|
  s = config.build_settings
  s['TARGETED_DEVICE_FAMILY'] = '1'                    # iPhone only for v1
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements' # Game Center
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['SWIFT_VERSION'] = '5.0'
end

# Ship the privacy manifest inside the app.
group = project.main_group['App'] or abort('No App group')
ref = group.files.find { |f| f.path == 'PrivacyInfo.xcprivacy' } || group.new_reference('PrivacyInfo.xcprivacy')
ref.last_known_file_type = 'text.xml'
unless target.resources_build_phase.files_references.include?(ref)
  target.resources_build_phase.add_file_reference(ref, true)
end

project.save
puts "  #{target.name}: iPhone only, Game Center entitlement, privacy manifest"
