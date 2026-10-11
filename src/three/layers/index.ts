// Every built-in layer type registers itself on import. To support a new message type, copy the closest file and
// call registerLayer from your app.
import "./pointcloud"
import "./pose"
import "./path"
import "./graph"
import "./pose_array"
import "./marker"
import "./boxes"
import "./labeled_points"
import "./occupancy"
import "./tf_frames"
import "./camera3d"
import "./detection2d"
