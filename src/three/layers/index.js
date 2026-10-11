// Every built-in layer type registers itself on import. To support a new message type, copy the closest file and
// call registerLayer from your app.
import "./pointcloud.js"
import "./pose.js"
import "./path.js"
import "./graph.js"
import "./pose_array.js"
import "./marker.js"
import "./boxes.js"
import "./labeled_points.js"
import "./occupancy.js"
import "./tf_frames.js"
import "./camera3d.js"
import "./detection2d.js"
